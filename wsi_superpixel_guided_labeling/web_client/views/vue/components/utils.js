import { schemeTableau10 } from './constants';

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
