==============================
WSI Superpixel Guided Labeling
==============================

WSI Superpixel Guided Labeling is a `Girder 3 <https://github.com/girder>`_ plugin for interactive development of image classifiers. It is designed to be used in conjunction with `HistomicsUI <https://github.com/DigitalSlideArchive/HistomicsUI>`_ and `HistomicsTK <https://github.com/DigitalSlideArchive/HistomicsTK>`_ and enables rapid development of classifiers with whole slide images using active learning.

This plugin can be used to classify objects ranging from cell nuclei to high-power fields, and can operate on user provided data or data from a built-in pipeline that parcellates a whole-slide image into superpixels (see ``dsarchive/superpixel:latest``).

The `Installation`_ instructions below describe how to install the plugin for your existing `Digital Slide Archive deployment <https://github.com/DigitalSlideArchive/digital_slide_archive/tree/master/devops/dsa>`_.

See the `Data Import`_ section for details on the data import script and data formatting.

.. contents:: Table of Contents:

Installation
------------

The recommended way to use this plugin is by adding it to the `Digital Slide Archive's <https://github.com/DigitalSlideArchive/digital_slide_archive>`_ ``docker-compose`` deployment. First, check out both this repository and ``digital_slide_archive`` from Github, if you do not yet have a running instance of the Digital Slide Archive.

If you don't already use a provisioning yaml file as part of your DSA deployment, you'll want to create one, e.g. ``provision.local.yaml``. Make sure this file contains the following: ::

    pip:
        - /opt/wsi-superpixel-guided-labeling
    rebuild-client: True
    resources:
        - model: collection
          name: Tasks
          creator: resource:admin
          public: True
        - model: folder
          parent: resource:collection/Tasks
          parentType: collection
          name: "Slicer CLI Web Tasks"
          creator: resource:admin
          public: True
        - model: collection
          name: "Active Learning"
          creator: resource:admin
          public: True
        - model: folder
          parent: "resource:collection/Active Learning"
          parentType: collection
          name: Data
          creator: resource:admin
          public: True
          metadata: {'active_learning': "true"}
          metadata_update: True
        - model: folder
          parent: "resource:collection/Active Learning/Data"
          parentType: folder
          name: Annotations
          creator: resource:admin
          public: True
        - model: folder
          parent: "resource:collection/Active Learning/Data"
          parentType: folder
          name: Models
          creator: resource:admin
          public: True
        - model: folder
          parent: "resource:collection/Active Learning/Data"
          parentType: folder
          name: Features
          creator: resource:admin
          public: True
    slicer-cli-image-pull:
        - dsarchive/histomicstk:latest
        - dsarchive/superpixel:latest

In ``digital_slide_archive/devops/dsa/``, you'll want to add or modify ``docker-compose.override.yaml`` in the following manner: ::

    ---
    version: '3'
    services:
        girder:
            volumes:
                - ./provision.local.yaml:/opt/digital_slide_archive/devops/dsa/provision.yaml
                - <path>/<to>/wsi-superpixel-guided-labeling:/opt/wsi-superpixel-guided-labeling

Where ``<path>/<to>/wsi-superpixel-guided-labeling`` is the path to this directory. These changes mount the source code for this plugin to the docker container so the plugin can be built. It also ensures the provisioning yaml will be used to install the plugin and perform some initial setup.

In the same directory, run ``DSA_USER=$(id -u):$(id -g) docker compose up``. (If that and ``docker compose version`` fail you may first need to invoke ``sudo apt install docker-compose-plugin``.) Once the deployment is stood up, you can verify that everything has been provisioned correctly by visiting ``localhost:8080``.

To verify, login as the provisioned admin user and check that the "WSI Superpixel Guided Labeling" plugin is installed by navigating to the Admin console from the sidebar and clicking "Plugins." Additionally there should be a collection called "Active Learning", which should contain one folder called "Data", which in turn should contain folders "Annotations," "Features," and "Models."

Using the Plugin
----------------

After following the installation instructions, you should have a folder called **Data** in a collection called **Active Learning**, which looks like the following:

.. image:: docs/screenshots/active_learning_folder.png
   :alt: Active Learning/Data folder after provision

To enable launching the Active Learning UI from a folder, you'll need to set metadata on the folder. You can do this from here by clicking the blue plus button in the metadata header, selected ``Simple``, and adding the following metadata property. If you used the recommended provisioning values, this will have already been done.

.. image:: docs/screenshots/active_learning_metadata.png
   :alt: Metadata to add. Key: active_learning, Value: true

Alternatively, you can set the ``activeLearning`` key to ``true`` in the ``.histomicsui_config.yaml`` file for the folder.

.. code-block:: yaml

   activeLearning: true

Upload the whole slide images you'd like to use for active learning to this folder, using the green upload button. Once your images have been uploaded, the ``Active Learning`` button should appear in the top right. If not, try refreshing the page. Click the ``Active Learning`` button to begin generating features and models for active learning.

.. image:: docs/screenshots/active_learning_button.png
    :alt: Button to launch the Active Learning workflow

The first step is to generate the superpixels and feature vectors. Using the form, you can control the approximate size of the superpixels generated (default is 100 pixels), and the magnification level at which to generate the superpixels (default is 5). You can also set the ``certainty metric`` (the default is ``confidence``) and the ``feature shape`` (the default is ``image``). Once you have chosen values for these fields, click the ``Generate Superpixels`` button. This will start a background process which can be monitored from the Girder Admin Console. This job could take some time to finish, and will take longer the more images you have in your folder. If you remain on the page, you will be taken to the next step automatically and as superpixels become available for each image you can begin labeling while the job completes.

.. image:: docs/screenshots/superpixel_generation.png
    :alt: The form for superpixel generation

In the initial labeling step, you will be able to create a set of categories for the superpixels, and label superpixels across your dataset to begin training the active learning models.

.. image:: docs/screenshots/initial_labels.png
    :alt: The initial label user interface

This view allows users to create new categories, set category colors, rename categories, and delete and/or merge categories. You can then use those categories to label superpixels by interacting with the image viewer. The ``Image`` drop down menu allows switching the current image shown in the image viewer. Clicking on a superpixel in the image viewer will label that superpixel with the currently displayed category. Clicking again on that superpixel will remove the label. Select the crosshairs on the labeling dialog to enable painting mode where you can continuously label or unlabel superpixels. A running total of superpixels labeled per category is available to the right of the image viewer.

Clicking on ``Begin Training`` will kick off a background process to begin training the active learning model using the labels provided in this step. Once that task is completed, you will be presented with a new view containing predictions as described below.

.. image:: docs/screenshots/active_learning_view.png
    :alt: The active learning view

From here, you can label superpixel features using the film strip area at the bottom to retrain the model. Each block of the film strip depicts one superpixel. The bar at the top of each block shows the most recent prediction. The superpixels shown are sorted so that users are shown the least confident predictions first. Users can add a label by either selecting a category that matches or differs from the prediction. Either the drop down menu can be used or you can use the hotkey assigned to the category. This hotkey value can also be changed in the labeling dialog.

In order to clear all user inputs on this screen , a ``Reset All`` button is provided. If the predictions for all of the visible blocks matches the actual class of the regions shown, there is an ``Agree to All`` button. You can also view a color-coded pixelmap of the current batch of predictions by clicking the ``Show/hide Predictions`` button.

After labeling some superpixels, a retrain can be triggered with the ``Retrain`` button. This will kick off a job to generate a new batch of predictions, using the newly created labels as input. This job should not take as long as the first, since superpixel and feature generation only needs to be performed once. While that job is running, interactions with this view are disabled. Once the job is finished, new superpixels will be shown to the user for labeling.

You can review trained or predicted superpixels via the review mode. This allows grouping by label, filtering, comparisons, and checking on another user's labeling choices.

.. image:: docs/screenshots/reviewmode.png
    :alt: The review mode

Data Import
-----------
Users can provide their own data for use with the platform, providing flexibility in the type of objects, and methods of detection/segmentation and encoding. A command-line import script is provided for the upload or import of this data. The required file formats and script details are described below.

Data formats
~~~~~~~~~~~~~~~~~~~~~~~~
Each slide in the dataset requires four files:

whole-slide image (various formats)
    Any format that is supported by `large image <https://girder.github.io/large_image/formats.html>`_ can be used.
feature (.h5)
    This file contains a single array where each row is a feature embedding for the object. A single blank row should be prepended if the image contains non-object background pixels.
pixelmap (.tiff)
    This image is used as a `pixelmap overlay <https://girder.github.io/large_image/annotations.html#tiled-pixelmap-overlays>`_ to define object locations for visualization and interactivity. Pixel values reflect the position of the object embedding in the feature file. For an object embedding in row 'i' of the feature array (zero-index), the corresponding pixels for that object should have value 2i, and the border pixels 2i+1. Non-object background pixels should be encoded using zero values.
    An example pixelmap is below:

    .. image:: docs/screenshots/pixelmap.png
       :alt: Pixelmap example
bounding boxes (.csv)
    Each row of this .csv defines the left, top, right, and bottom pixel for a single object. Objects should be listed in the same order as they appear in the feature.h5 file.
    For the pixelmap example above, assuming (0,0) is the top left, the csv file would have the following line:

.. code-block:: csv

    1,1,4,4


Command-line Import Tool
~~~~~~~~~~~~~~~~~~~~~~~~
data_import.py is provided to import or upload user-generated data into the plugin.

Import requires a csv file defining the paths to input files, an API key for your DSA instance, and a project name: ::

    > data_import inputs.csv UI65ixMezye0LpBOyYozArB9czPu3PLNpq0RGlGn new_project

Here, input.csv lists the whole-slide image, feature h5 file, pixelmap .tiff image, bounding box csv, and pixelmap downscale factor on each row: ::

    > more inputs.csv
    /remote/a.svs,/remote/a.svs.feature.h5,/remote/a.svs.pixelmap.tiff,/local/a.svs.boxes.csv,4
    /remote/b.svs,/remote/b.svs.feature.h5,/remote/b.svs.pixelmap.tiff,/local/b.svs.boxes.csv,4

Feature h5 filenames should follow the pattern [slide_filename].*.feature.h5, but other filenames are unrestricted.

If importing data from DSA mounted storage, provide an identifier for the assetstore where the files are mounted using the -a option. This
identifier can be determined from the DSA Admin console.

-a, --assetstore  Identifier for storage assetstore if importing files
-u, --url         URL for server. Defaults to http://localhost:8080/api/v1
-r, --replace     Replace existing wsis, features, or pixelmaps

Features
--------

* Adds a new view which can be accessed from the Girder 3 UI for folders that are configured for this workflow

Updating CLI Images
-------------------

The Superpixel CLI Docker image that is used for computing superpixels, extracting features, training models, and predicting labels can be updated without updating the whole system.  This can be done by selecting ``Collections`` -> ``Tasks`` -> ``Slicer CLI Web Tasks`` -> ``dsarchive/superpixel`` -> ``latest`` and then clicking on the ``Pull Latest`` button near the upper right.

In the provisioning yaml file, if ``slicer-cli-image-pull`` is used rather than ``slicer-cli-image``, this will also ensure the latest version of the docker image is available when the system is restarted with docker compose.


Acknowledgements
----------------

This work has been funded in part by National Library of Medicine grant 5R01LM013523 entitled "Guiding humans to create better labeled datasets for machine learning in biomedical research".

