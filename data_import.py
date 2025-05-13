import argparse
from girder_client import GirderClient
import hashlib
import os
from tqdm import tqdm


def _import_str(path, file, destination):
    '''Format the arguments for the assetstore/id/import endpoint to
       import a single file.'''
    return dict(
        importPath=path,
        destinationId=destination,
        destinationType='folder',
        fileIncludeRegex=f'^{file}$',
        progress=True,
    )


def _import_file(client, assetstore, folder, file, replace=False):
    '''Import a single file given the assetstore, filename and destination.
       Optionally replace the item if an item with the same name exists.'''
    match = list(client.listItem(folder, name=os.path.split(file)[1]))
    import_args = _import_str(
        os.path.split(file)[0], os.path.split(file)[1], folder
    )
    if len(match) and not replace:
        return match[0]['_id']
    elif len(match) and replace:
        client.delete(f'item/{match[0]["_id"]}')
    client.post(f'assetstore/{assetstore}/import', import_args)
    match = list(client.listItem(folder, name=os.path.split(file)[1]))
    assert len(match) == 1
    return match[0]['_id']


def _upload_file(client, folder, file, replace=False):
    '''Upload a single file given the assetstore, filename and destination.
       Optionally replace the item if an item with the same name exists.'''
    match = list(client.listItem(folder, name=os.path.split(file)[1]))
    if len(match) and replace:
        client.delete(f'item/{match[0]["_id"]}')
        return client.uploadFileToFolder(folder, file)['_id']
    elif len(match) and not replace:
        return match[0]['_id']
    else:
        return client.uploadFileToFolder(folder, file)['_id']


def _feature_h5filename(wsi_id, boxes, patchsize=100):
    '''Generate h5 feature filename.
    wsi_id : str
        The girder identifier of the associated whole slide image.
    boxes : list of floats
        Bounding boxes of objects in the order they appear in the feature array.
        This is a 1D array/list with left, top, right, bottom in sequence for
        each box at scan magnification.
    patchsize : int
        The size of the patches used during feature extraction.
    '''
    hashval = repr(
        dict(itemId=wsi_id, bbox=[int(v) for v in boxes], patchSize=patchsize)
    )
    hash = hashlib.new('sha256', hashval.encode()).hexdigest()
    return f'feature-{hash}.h5'


def pixelmap_annotation(pixelmap_id, scale, boxes):
    '''Generate JSON format pixelmap annotation to attach to whole-slide image.
    pixelmap_id : string
        The girder identifier of the pixelmap image (not the whole-slide image).
    scale : float
        Scaling ratio between the whole-slide and pixelmap image resolutions. For
        example, scale for a wsi at 20X and pixelmap of 5x would be 4.
    '''

    values = [*[0] * (len(boxes) // 4)]
    categories = [dict(
        label="default", fillColor="rgba(0, 0, 0, 0)", strokeColor="rgba(0, 0, 0, 1)"
    )]
    transform = dict(
        xoffset=0, yoffset=0, matrix=[[scale, 0], [0, scale]]
    )
    pixelmap = dict(
        type='pixelmap',
        girderId=pixelmap_id,
        boundaries=True,
        transform=transform,
        values=values,
        categories=categories,
    )
    annotation = dict(
        name='Superpixel Epoch 0',
        elements=[pixelmap],
    )
    return annotation


def guided_label_import(
    client, collection, wsis, features, pixelmaps, boxes, scales, assetstore=None, replace=False
):
    '''Import or upload a guided labeling dataset to a digital slide archive instance.

    :param client: An authenticated GirderClient object.
    :param collection: Name of the project to create. If a collection with this name exists,
        it will be used.
    :param wsis: A list of paths to wsi filenames on local (upload) or mounted (import)
        storage.
    :param features: A list of paths to h5 feature files in the same order as `wsis`.
    :param pixelmaps: A list of paths to tiff pixelmap image files in the same order as
        `wsis`.
    :param boxes: A list of 2D arrays containing the left, top, right, and bottom of the
        bounding box for each object in each pixelmap. Coordinates should be listed at
        native scan magnification. The order of objects in each 2D array should follow
        the order of values in the corresponding pixelmap.
    :param scales: The float ratios of resolutions between the whole-slide images and the
        corresponding pixelmap images.
    :param assetstore: The girder id of the assetstore if data will be imported.
        Default value of `None` means data will be uploaded and that all paths in `wsis`,
        `features`, and `pixelmaps` are local file paths.
    :param bool: If True, replace items during import or upload where filenames match.
    '''

    # if collection does not exist, create it, otherwise get collection id
    match = client.get('collection', dict(text=collection, limit=0))
    if len(match):
        collection = match[0]['_id']
    else:
        collection = client.post('collection', dict(name=collection))['_id']

    # construct folders if necessary
    data_folder = client.loadOrCreateFolder('Data', collection, 'collection')['_id']
    client.addMetadataToFolder(data_folder, {'active_learning': True})
    feature_folder = client.loadOrCreateFolder('Features', data_folder, 'folder')['_id']
    pixelmap_folder = client.loadOrCreateFolder('Annotations', data_folder, 'folder')['_id']
    client.loadOrCreateFolder('Models', data_folder, 'folder')['_id']

    # import if data assetstore provided, otherwise upload
    wsi_ids = {}
    feature_ids = {}
    pixelmap_ids = {}
    for w, f, p, b, s in tqdm(
        zip(wsis, features, pixelmaps, boxes, scales), total=len(wsis),
        desc='Importing' if assetstore else 'Uploading'
    ):
        if assetstore:
            wsi_ids[w] = _import_file(client, assetstore, data_folder, w, replace)
            feature_ids[f] = _import_file(client, assetstore, feature_folder, f, replace)
            pixelmap_ids[p] = _import_file(client, assetstore, pixelmap_folder, p, replace)
        else:
            wsi_ids[w] = _upload_file(client, data_folder, w, replace)
            feature_ids[f] = _upload_file(client, feature_folder, f, replace)
            pixelmap_ids[f] = _upload_file(client, pixelmap_folder, p, replace)

        # check for existing pixelmap annotation in wsi
        # generate and post annotation if necessary
        existing = client.get(f'/annotation/item/{wsi_ids[w]}')
        document = pixelmap_annotation(
            pixelmap_ids[p], s, [x for box in b for x in box]
        )
        if len(existing) and replace:
            for annotation in existing:
                client.delete(f'/annotation/{annotation["_id"]}')
            client.post(f'/annotation?itemId={wsi_ids[w]}', json=document)
        else:
            skip = [
                element['type'] == 'pixelmap'
                for annotation in existing
                for element in annotation['annotation']['elements']
            ]
            if not any(skip):
                client.post(f'/annotation?itemId={wsi_ids[w]}', json=document)
    return collection


def main():
    parser = argparse.ArgumentParser(
        description=(
            'Import or upload a guided labeling dataset to a digital slide archive instance.'
        )
    )
    parser.add_argument(
        'input',
        type=str,
        help=(
            'Comma separated file listing wsi, feature (h5), pixelmap (tiff), and bounding box '
            '(csv - local) input files.'
        ),
    )
    parser.add_argument(
        'key',
        type=str,
        help=(
            'API key for the server (see /api/v1#/api_key/api_key_createKey_post_api_key).'
        ),
    )
    parser.add_argument(
        'collection',
        type=str,
        help=(
            'Name of the created collection / project.'
        ),
    )
    parser.add_argument(
        '-u',
        '--url',
        type=str,
        default='http://localhost:8080/api/v1',
        help=(
            'Optional URL for the DSA API. Efaults to http://localhost:8080/api/v1.'
        ),
    )
    parser.add_argument(
        '-a',
        '--assetstore',
        type=str,
        help=(
            'Optional identifier of the assetstore for file import. Defaults to upload (None).'
        ),
    )
    parser.add_argument(
        '-r',
        '--replace',
        dest='replace',
        action='store_true',
        help=(
            'Optional replace existing wsis, features, or pixelmaps. Defaults to no replacement.'
        ),
    )
    args = parser.parse_args()

    # create and authenticate client
    client = GirderClient(apiUrl=args.url)
    client.authenticate(apiKey=args.key)

    # parse input to build lists of files
    inputs = []
    with open(args.input, 'r') as f:
        for line in f:
            wsi, feature, pixelmap, box, scales = line.strip().split(',')
            inputs.append((wsi, feature, pixelmap, box, scales))
    wsis = [row[0] for row in inputs]
    features = [row[1] for row in inputs]
    pixelmaps = [row[2] for row in inputs]
    boxes = [row[3] for row in inputs]
    scales = [row[4] for row in inputs]

    # build list of bounding boxes
    bounding = []
    for b in boxes:
        with open(b, 'r') as f:
            box = [
                [int(x) for x in line.strip().split(',')]
                for line in f
            ]
        bounding.append(box)

    # import if assetstore defined, otherwise upload
    guided_label_import(
        client, args.collection,
        wsis, features, pixelmaps, bounding, scales,
        args.assetstore, args.replace
    )


if __name__ == "__main__":
    main()
