/**
 * Provide an extended list of default hotkeys. By default zero will be the
 * "reset" option and 1 through 9 will represent the first 9 categories. After
 * that the hotkeys follow the standard QWERTY keyboard layout, row by row.
 */
export const hotkeys = [
    '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
    'q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p',
    'a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l',
    'z', 'x', 'c', 'v', 'b', 'n', 'm'
];

/**
 * List of options that can be combined with hotkeys to create new bindings
 */
export const comboHotkeys = ['ctrl', 'shift', 'alt'];

/**
 * Default colors for new categories from the d3 tableau10 scheme.
 * https://d3js.org/d3-scale-chromatic/categorical#schemeTableau10
 */
export const schemeTableau10 = [
    '#4e79a7',
    '#f28e2c',
    '#e15759',
    '#76b7b2',
    '#59a14f',
    '#edc949',
    '#af7aa1',
    '#ff9da7',
    '#9c755f',
    '#bab0ab'
];

export const viewMode = {
    Setup: 0,
    Labeling: 1,
    Guided: 2,
    Review: 3
};

export const boundaryColor = 'rgba(0, 0, 0, 1)';
