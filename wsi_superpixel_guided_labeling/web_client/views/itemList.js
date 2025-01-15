import { wrap } from '@girder/core/utilities/PluginUtils';
import ItemListWidget from '@girder/core/views/widgets/ItemListWidget';
import _ from 'underscore';
import { restRequest } from '@girder/core/rest';

const specialFolders = ['Annotations', 'Models', 'Features'];

/**
 * When we view an item list, look for the histomicsui config file. Check that
 * the activeLearning key is set to true and make sure there is at least one
 * item present. If all criteria is met, add the "Active Learning" button.
 */
wrap(ItemListWidget, 'render', function (render) {
    render.call(this);
    const thisFolder = this.parentView.parentModel;
    if (specialFolders.includes(thisFolder.attributes.name)) {
        // Ignore the special Annotations, Models, and Features folders
        return;
    }

    restRequest({
        url: `folder/${thisFolder.id}/yaml_config/.histomicsui_config.yaml`
    }).done((config) => {
        if (config && config['activeLearning'] || metaKeySet) {
            const largeImageItems = _.filter(this.collection.models, (model) => model.attributes.largeImage);
            // Don't make the request if the button already exists
            if (largeImageItems.length && !this.parentView.$el.find('.wsi-al-open').length) {
                restRequest({
                    type: 'GET',
                    url: 'histomicsui/settings'
                }).then((settings) => {
                    if (!this.parentView.$el.find('.wsi-al-open').length) {
                        // Add the Active Learning button
                        const webrootPath = settings['histomicsui.webroot_path'];
                        const btnContainer = this.parentView.$el.find('.g-folder-header-buttons');
                        btnContainer.prepend(
                            `<a class="wsi-al-open btn btn-sm btn-primary" role="button" href="${webrootPath}#/active-learning?folder=${this.parentView.parentModel.id}" target="_blank">
                                <i class="icon-link-ext"></i>Active Learning
                            </a>`
                        );
                    }
                    return 0;
                });
            }
        }
    });
});
