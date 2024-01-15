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
