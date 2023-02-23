import { wrap } from '@girder/core/utilities/PluginUtils';
import ItemListWidget from '@girder/core/views/widgets/ItemListWidget';
import _ from 'underscore';
import { restRequest } from '@girder/core/rest';

wrap(ItemListWidget, 'render', function (render) {
    render.call(this);
    const activeLearningFolder = this.parentView.parentModel.get('meta')['active_learning'];
    if (activeLearningFolder) {
        const largeImageItems = _.filter(this.collection.models, (model) => model.attributes.largeImage);
        // don't make the request if the button already exists
        if (largeImageItems.length && !this.parentView.$el.find('.wsi-al-open-setup').length) {
            restRequest({
                type: 'GET',
                url: 'histomicsui/settings'
            }).then((settings) => {
                // prevent double-rendering
                if (!this.parentView.$el.find('.wsi-al-open-setup').length) {
                    const webrootPath = settings['histomicsui.webroot_path'];
                    const btnContainer = this.parentView.$el.find('.g-folder-header-buttons');
                    btnContainer.prepend(
                        `<a class="wsi-al-open-setup btn btn-sm btn-primary" role="button" href="${webrootPath}#/active-learning?folder=${this.parentView.parentModel.id}" target="_blank">
                            <i class="icon-link-ext"></i>Active Learning
                        </a>`
                    );
                }
                return 0;
            });
        }
    }
});
