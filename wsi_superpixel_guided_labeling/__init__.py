from pathlib import Path

from girder import plugin

class WSISuperpixelGuidedLabelingPlugin(plugin.GirderPlugin):
    DISPLAY_NAME = 'WSI Superpixel Guided Labeling'

    def load(self, info):
        plugin.getPlugin('histomicsui').load(info)
        # add plugin loading logic here
        plugin.registerPluginStaticContent(
            plugin='wsi_superpixel_guided_labeling',
            css=['/style.css'],
            js=['/girder-plugin-wsi-superpixel-guided-labeling.umd.js'],
            staticDir=Path(__file__).parent / 'web_client' / 'dist',
            tree=info['serverRoot'],
        )
