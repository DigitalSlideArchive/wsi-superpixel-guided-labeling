import pytest

from girder.plugin import loadedPlugins


@pytest.mark.plugin('wsi_superpixel_guided_labeling')
def test_import(server):
    assert 'wsi_superpixel_guided_labeling' in loadedPlugins()
