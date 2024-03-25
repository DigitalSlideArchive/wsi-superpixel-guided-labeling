import { wrap } from '@girder/core/utilities/PluginUtils';
import HeaderImageView from '@girder/histomicsui/views/layout/HeaderImageView.js';

wrap(HeaderImageView, 'render', function (render) {
    render.call(this);
    const isActiveLearning = window.location.href.includes('active-learning');
    if (isActiveLearning) {
        this.$el.find('.h-open-annotated-image').remove();
        this.$el.find('.h-open-image').remove();
        this.$el.find('.h-links').remove();
        this.parentView.$el.find('.navbar-collapse').prepend(`<div id="active-learning-toolbar"/>`);
    }
});
