import { schemeTableau10 } from './constants';
import { store } from './store';

// Only necessary until we have native support for Promises with es6.
// Used for Promise.all() and Promise.resolve() support.
const Promise = require('bluebird');

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

/**
 * Creates a debounced version of a given function, guaranteeing that only one
 * instance of the function executes at a time for the same arguments. If a
 * new call is made with the same arguments while a previous call is still in
 * progress, the latest call is queued and executed after the in-progress
 * call finishes. Newer calls replace queued calls so that intermediate calls
 * are debounced.
 *
 * @param {Function} fn - The function to debounce.
 * @param {boolean} [trackArguments=false] - If true, the function will track
 *     calls based on arguments, ensuring separate queues for each unique
 *     argument set. If false, all calls share a single queue regardless of
 *     arguments.
 * @returns {Function} - A debounced version of the provided function.
 *
 * @example
 * const simulatedRestRequest = async (arg) => {
 *     console.log("Processing:", arg);
 *     await sleep(1000); // Simulate processing delay
 * };
 * const debouncedRequest = debounce(simulatedRestRequest, true);
 * debouncedRequest("A"); // Should process immediately
 * debouncedRequest("A"); // Should queue, processed after the first completes
 * debouncedRequest("A"); // Should replace the previous queued request
 */

export const debounce = (fn, debounceByArguments = false) => {
    const inProgress = new Map(); // Track in-progress requests
    const queuedRequests = new Map(); // Queue to ensure last request is always processed

    function execute(...args) {
        const stringArgs = debounceByArguments ? JSON.stringify(args) : '';
        Promise.resolve(fn.apply(this, args))
            .then((response) => response)
            .finally(() => {
            // Clean up the queue and update in-progress requests
                inProgress.delete(stringArgs);
                if (queuedRequests.has(stringArgs)) {
                // If we have queued requests continue processing them
                    queuedRequests.delete(stringArgs);
                    inProgress.set(stringArgs, true);
                    execute.apply(this, args);
                }
            });
    }

    return function (...args) {
        const stringArgs = debounceByArguments ? JSON.stringify(args) : '';
        if (!inProgress.has(stringArgs)) {
            // When there's nothing in progress process the request immediately
            inProgress.set(stringArgs, true);
            execute.apply(this, args);
        } else {
            // If there is a request in process, queue this request to be processed after it completes.
            // If there was already a queued request it will be removed (debounced).
            if (queuedRequests.has(stringArgs)) {
                queuedRequests.delete(stringArgs);
            }
            queuedRequests.set(stringArgs);
        }
    };
};
