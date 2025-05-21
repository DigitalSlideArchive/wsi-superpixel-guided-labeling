import pytest

from girder.plugin import loadedPlugins


@pytest.mark.plugin('histomics_label')
def test_import(server):
    assert 'histomics_label' in loadedPlugins()
