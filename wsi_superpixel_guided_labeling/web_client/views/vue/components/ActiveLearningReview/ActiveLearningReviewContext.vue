<script>
import Vue from 'vue';
import { restRequest } from '@girder/core/rest';
import { ViewerWidget } from '@girder/large_image_annotation/views';

import { store } from '../store.js';

export default Vue.extend({
    props: ['superpixel'],
    data() {
        return {
            featureLayer: null,
            boundingBoxFeature: null,
            initialZoom: 1,
            currentImageMetadata: {},
            reviewed: 0
        };
    },
    computed: {
        backboneParent() {
            return store.backboneParent;
        },
        selectedImageId() {
            if (!this.superpixel) {
                return '';
            }
            return this.superpixel.imageId;
        },
        annotationsByImageId() {
            return store.annotationsByImageId;
        },
        imageItemsById() {
            return store.backboneParent.imageItemsById;
        }
    },
    watch: {
        selectedImageId(newImageId, oldImageId) {
            if (newImageId && newImageId !== oldImageId) {
                // TODO: consider caching image metadata for each image the first time this request gets made
                restRequest({
                    url: `item/${this.selectedImageId}/tiles`
                }).done((resp) => {
                    this.currentImageMetadata = resp;
                    this.createImageViewer();
                });
            } else {
                this.updateMapBoundsForSelection();
            }
        }
    },
    methods: {
        createImageViewer() {
            if (this.viewerWidget) {
                this.viewerWidget.destroy();
            }
            this.viewerWidget = new ViewerWidget.geojs({ // eslint-disable-line new-cap
                parentView: this.backboneParent,
                el: this.$refs.context,
                itemId: this.selectedImageId,
                hoverEvents: false,
                highlightFeatureSizeLimit: 5000,
                scale: { position: { bottom: 20, right: 10 } }
            });
            this.viewerWidget.on('g:imageRendered', () => {
                this.featureLayer = this.viewerWidget.viewer.createLayer('feature', { features: ['polygon'] });
                this.boundingBoxFeature = this.featureLayer.createFeature('polygon');
                this.boundingBoxFeature.style({
                    fillOpacity: 0,
                    stroke: true,
                    strokeWidth: 4,
                    strokeColor: { r: 255, g: 255, b: 0 }
                });
                this.initialZoom = this.viewerWidget.viewer.zoom();
                this.viewerWidget.viewer.clampBoundsX(false);
                this.viewerWidget.viewer.clampBoundsY(false);

                // Remove keyboard actions
                const interactor = this.viewerWidget.viewer.interactor();
                interactor.keyboard({});

                this.updateMapBoundsForSelection();
                this.drawLabels();
            });
        },
        updateMapBoundsForSelection() {
            if (!this.viewerWidget) {
                return;
            }
            // Center the selected superpixel
            const bbox = this.superpixel.bbox;
            const bboxWidth = bbox[2] - bbox[0];
            const bboxHeight = bbox[3] - bbox[1];
            const scaleX = Math.abs((2 * bboxWidth) / this.currentImageMetadata.sizeX);
            const scaleY = Math.abs((2 * bboxHeight) / this.currentImageMetadata.sizeY);
            const zoom = this.initialZoom - Math.log2(Math.max(scaleX, scaleY));
            const center = {
                x: (bbox[0] + bbox[2]) / 2,
                y: (bbox[1] + bbox[3]) / 2
            };
            // Draw bounding box around selected superpixel
            this.viewerWidget.viewer.zoom(zoom - 1.5);
            this.viewerWidget.viewer.center(center);
            this.boundingBoxFeature.data([[
                [bbox[0], bbox[1]], [bbox[2], bbox[1]], [bbox[2], bbox[3]], [bbox[0], bbox[3]]
            ]]);
            this.featureLayer.draw();
        },
        drawLabels() {
            const annotation = this.annotationsByImageId[this.superpixel.imageId].labels;
            this.viewerWidget.drawAnnotation(annotation);
        }
    }
});
</script>

<template>
  <div
    v-if="superpixel"
    class="modal fade"
  >
    <div class="context-dialog modal-dialog">
      <div class="modal-content dialog-content">
        <div class="modal-header">
          <button
            type="button"
            class="close"
            data-dismiss="modal"
          >
            &times;
          </button>
          <h4 class="modal-title">
            Superpixel Review
          </h4>
        </div>
        <div class="dialog-body modal-body">
          <div class="summary">
            <h4>Summary</h4>
            <hr>
            <div>
              <table class="table table-condensed">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Slide</td>
                    <td>{{ imageItemsById[superpixel.imageId].name }}</td>
                  </tr>
                  <tr>
                    <td>Prediction</td>
                    <td>{{ superpixel.predictionCategories[superpixel.prediction].label }}</td>
                  </tr>
                  <tr>
                    <td>Selection</td>
                    <td>{{ superpixel.predictionCategories[superpixel.selectedCategory].label }}</td>
                  </tr>
                  <tr>
                    <td>Certainty</td>
                    <td>{{ superpixel.certainty }}</td>
                  </tr>
                  <tr>
                    <td>Confidence</td>
                    <td>{{ superpixel.confidence }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <h4>Review</h4>
            <hr>
            <div>
              <label for="reviewer">Override</label>
              <select
                id="reviewer"
                v-model="reviewed"
                class="form-control input-sm"
              >
                <option :value="0">
                  -----
                </option>
                <option :value="1">
                  Approve
                </option>
                <option :value="2">
                  background
                </option>
                <option :value="3">
                  marker
                </option>
                <option :value="4">
                  tissue
                </option>
              </select>
            </div>
          </div>
          <div
            ref="context"
            class="context-map"
          />
        </div>
        <div class="modal-footer">
          <button
            type="button"
            class="btn btn-default"
            data-dismiss="modal"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.context-dialog{
    width: 90%;
    margin: auto;
}

.dialog-content{
    height: 90vh;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
}

.dialog-body{
    display: flex;
    flex-direction: row;
    height: 75vh;
}

.summary {
    margin-right: 5px;
    width: 25%;
}

.context-map {
    min-width: 75%;
    min-height: 100%;
}
</style>
