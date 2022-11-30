/* global $, __webpack_public_path__ */
import View from '@girder/core/views/View';
import _ from 'underscore';

import router from '@girder/histomicsui/router';

import setupTemplate from '../../templates/body/activeLearningSetupView.pug';
import ActiveLearningSetupContainer from '../vue/components/ActiveLearningSetup/ActiveLearningSetupContainer.vue';

import '../../stylesheets/body/learning.styl';

var ActiveLearningSetupView = View.extend({
    initialize(settings) {
        this.render();
        router.setQuery();
        this.trainingDataFolderId = router.getQuery('folder');
    },

    mountVueComponent() {
        if (this.vueApp) {
            this.vueApp.$destroy();
        }
        const el = this.$('.h-active-learning-setup-container').get(0);
        // eslint-disable-next-line
        const root = (__webpack_public_path__ || '/status/built').replace(/\/$/, '');
        const geojsUrl = root + '/plugins/large_image/extra/geojs.js';
        $.ajax({
            url: geojsUrl,
            dataType: 'script',
            cache: true
        }).done((resp) => {
            this.vueApp = new ActiveLearningSetupContainer({
                el
            });
        });
    },

    render() {
        this.$el.html(setupTemplate());
        this.mountVueComponent();
    }
});

export default ActiveLearningSetupView;
