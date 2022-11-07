from girder import plugin


class GirderPlugin(plugin.GirderPlugin):
    DISPLAY_NAME = 'WSI Superpixel Guided Labeling'
    CLIENT_SOURCE_PATH = 'web_client'

    def load(self, info):
        # add plugin loading logic here
        plugin.getPlugin('histomicsui').load(info)
