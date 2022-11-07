import { wrap } from '@girder/core/utilities/PluginUtils';
import HierarchyWidget from '@girder/core/views/widgets/HierarchyWidget';
import { restRequest } from '@girder/core/rest';

wrap(HierarchyWidget, 'render', function (render) {
    render.call(this);
    restRequest({
        type: 'GET',
        url: 'histomicsui/settings'
    }).then((settings) => {
        const activeLearningFolder = this.parentModel.get('meta')['active_learning'];
        const webrootPath = settings['histomicsui.webroot_path'] || '';
        if (activeLearningFolder && !this.$el.find('.wsi-al-open-active-learning').length) {
            const btnContainer = this.$el.find('.g-folder-header-buttons');
            btnContainer.prepend(
                `<a class="wsi-al-open-active-learning btn btn-sm btn-primary" role="button" href="${webrootPath}#/active-learning?folder=${this.parentModel.id}" target="_blank">
                    <i class="icon-link-ext"></i>Active Learning
                </a>`
            );
        }
        return settings;
    });
});
