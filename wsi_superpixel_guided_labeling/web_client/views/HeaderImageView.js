const { wrap } = girder.utilities.PluginUtils;
const HeaderImageView = girder.plugins.histomicsui.views.layout.HeaderImageView;

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
