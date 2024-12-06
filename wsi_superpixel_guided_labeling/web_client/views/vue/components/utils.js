import _ from 'underscore';

import { schemeTableau10 } from './constants';
import { store } from './store';

/**
 * Find the default color given the index of an item. Uses the
 * schemeTableau10 color scheme.
 *
 * @param {int} index The index of the item that we need a default color for
 * @returns {string} RGBA value in the format "rgba(r, g, b, a)"
 */
export const getFillColor = (index) => {
    const hexColor = schemeTableau10[index % 10];
    const [r, g, b] = hexColor.slice(1).match(/.{1,2}/g);
    return `rgba(${parseInt(r, 16)}, ${parseInt(g, 16)}, ${parseInt(b, 16)}, 0.5)`;
};

/**
 * Parse an RGBA string to get an array of the numeric rgba values
 *
 * @param {string} rgbStr RGBA value in the format "rgba(r, g, b, a)"
 * @returns {array} An array of Numbers
 */
export const rgbStringToArray = (rgbStr) => {
    return rgbStr.match(/\d+(?:\.\d+)?/g).map(Number);
};

/**
 * Update the current epoch's label annotation metadata when a review or label
 * has been set or changed.
 *
 * @param {object} superpixel The superpixel that has had its label or review set
 * @param {int} newValue The new category that the review or label should be set to
 * @param {boolean} isReview Whether or not this is a review. Will update the label if not a review.
*/
export const updateMetadata = (superpixel, newCategory, isReview) => {
    const labels = store.annotationsByImageId[superpixel.imageId].labels;
    const meta = labels.get('annotation').attributes.metadata;
    // If no new value is provided user selection is correct
    const key = isReview ? 'review' : 'label';
    superpixel.index in meta || (meta[superpixel.index] = {});
    meta[superpixel.index][`${key}er`] = store.currentUser;
    meta[superpixel.index][`${key}Date`] = new Date().toDateString();
    meta[superpixel.index][`${key}Value`] = newCategory;
    meta[superpixel.index][`${key}Epoch`] = store.epoch;

    if (isReview) {
        superpixel.reviewValue = newCategory;
    }
};


export const debounce = (fn, trackArguments = false) => {
    const inProgress = new Map();
    const queuedRequests = new Map();

    function execute(...args) {
        const stringArgs = trackArguments ? JSON.stringify(args) : '';
        // add stringArgs to inProgress
        if (!inProgress.has(stringArgs)) {
            inProgress.set(stringArgs, true);
        }
        Promise.resolve(fn.apply(this, args))
        .then((response) => response)
        .finally(() => {
            console.log('completed ', stringArgs);
            // remove stringargs from in progress
            inProgress.delete(stringArgs);
            // get stringArgs from queue
            if (queuedRequests.has(stringArgs)) {
                // if request exists remove stringArgs from queue
                queuedRequests.delete(stringArgs);
                // call execute w/ args
                execute.apply(this, args);
            }
        })
    }

    return function (...args) {
        const stringArgs = trackArguments ? JSON.stringify(args) : '';
        // if call not in progress
        if (!inProgress.has(stringArgs)) {
            // execute
            inProgress.set(stringArgs, true);
            console.log('started ', stringArgs);
            execute.apply(this, args);
        } else {
        // if call in progress
            // if call queued
            if (queuedRequests.has(stringArgs)) {
                // remove from queue
                queuedRequests.delete(stringArgs);
            }
            // queue new call
            queuedRequests.set(stringArgs);
            console.log('queued ', stringArgs);
        }
    };
}
