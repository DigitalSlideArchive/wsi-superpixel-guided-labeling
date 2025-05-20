import { wrap } from '@girder/core/utilities/PluginUtils';
import HeaderView from '@girder/histomicsui/views/layout/HeaderView';

wrap(HeaderView, 'render', function (render) {
    const isActiveLearning = window.location.href.includes('active-learning');
    if (isActiveLearning) {
        this.settings.helpURL = 'https://github.com/DigitalSlideArchive/wsi-superpixel-guided-labeling/#readme';
        this.settings.helpTooltip = 'Guided labeling plugin information';
    }
    render.call(this);
});
