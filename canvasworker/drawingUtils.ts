export interface Transformation {
    translateX: number;
    translateY: number;
    scaleX: number;
    scaleY: number;
    rotate: number;
    translateBeforeScale: boolean;
    rotateLast: boolean;
}

export class DrawingUtils {
    static parseTransform(transform: string | {}): Transformation {
        const transformObject: Transformation = {
            translateX: 0,
            translateY: 0,
            scaleX: 1,
            scaleY: 1,
            rotate: 0,
            translateBeforeScale: false,
            rotateLast: false,
        };

        if (transform) {
            if (typeof transform !== 'string') {
                transformObject.scaleX = transform['k'];
                transformObject.scaleY = transform['k'];
                transformObject.translateX = transform['x'];
                transformObject.translateY = transform['y'];
                transformObject.translateBeforeScale = true;
                return transformObject;
            }
            let transformString = <string>transform;
            transformString = transformString.replace(/ /g, '');

            //let translate  = /translate\((\d+),(\d+)\)/.exec(transform);
            const translate = /\s*translate\(([-0-9.]+),([-0-9.]+)\)/.exec(transformString);
            if (translate) {
                transformObject.translateX = parseFloat(translate[1]);
                transformObject.translateY = parseFloat(translate[2]);
            } else {
                //console.error('no translate found', transform);
            }

            const scale = /\s*scale\(([-0-9.]+)(,[-0-9.]+)?\)/.exec(transformString);
            if (scale) {
                transformObject.scaleX = parseFloat(scale[1]);
                transformObject.scaleY = scale[2]
                    ? parseFloat(scale[2].substr(1))
                    : parseFloat(scale[1]);
            } else {
                //console.error('no scale found', transform);
            }

            const rotate = /\s*rotate\(([-0-9.]+)\)/.exec(transformString);
            if (rotate) {
                transformObject.rotate = parseFloat(rotate[1]);
            } else {
                //console.error('no rotate found', transform);
            }

            const translateScale = /\s*translate\(([-0-9.]+),([-0-9.]+)\)scale\(([-0-9.,]+)\)/.exec(
                transformString
            );
            if (translateScale) {
                transformObject.translateBeforeScale = true;
            }

            const rotateLast = /\s*rotate\(([-0-9.,]+)\)$/.exec(transformString);
            if (rotateLast) {
                transformObject.rotateLast = true;
            }

            const matrix = /\s*matrix\(([-0-9.]+),([-0-9.]+),([-0-9.]+),([-0-9.]+),([-0-9.]+),([-0-9.]+)\)/.exec(
                transformString
            );
            if (matrix) {
                transformObject.scaleX = parseFloat(matrix[1]);
                // 2 is horizontal skewing
                // 3 is vertical skewing
                transformObject.scaleY = parseFloat(matrix[4]);
                transformObject.translateX = parseFloat(matrix[5]);
                transformObject.translateY = parseFloat(matrix[6]);
            }
        }

        return transformObject;
    }

    static addTransforms(transformA: Transformation, transformB: Transformation): Transformation {
        return {
            translateX: transformA.translateX + transformB.translateX,
            translateY: transformA.translateY + transformB.translateY,
            scaleX: transformA.scaleX * transformB.scaleX,
            scaleY: transformA.scaleY * transformB.scaleY,
            rotate: transformA.rotate + transformB.rotate,
            translateBeforeScale: false,
            rotateLast: false,
        };
        //TODO: consider translateBeforeScale and rotateLast
    }

    static convertSizeToPx(size: string | number, fallback = true): number | undefined {
        const defaultValue = fallback ? 14 : undefined;
        if (size === undefined) {
            return defaultValue;
        }
        if (typeof size === 'number') {
            return size;
        }
        if (size.substr(-2) === 'em') {
            return Math.round(parseFloat(size) * 12);
        }
        if (size.substr(-2) === 'px') {
            return parseInt(size);
        }
        if (size.match(/^[0-9]+$/)) {
            return parseInt(size);
        }
        console.warn('size in unsupported format: ', size);
        return defaultValue;
    }

    static rgbaCache = {};
    static colorToRgba(
        color: string | {r: number; g: number; b: number} | {h: number; s: number; l: number},
        opacity: string | number = 1,
        defaultColor = 'none'
    ): string {
        if (color === 'none') {
            return color;
        }
        if (!color) {
            color = defaultColor;
        }
        const cacheKey = `${color}-${opacity}`;
        if (DrawingUtils.rgbaCache[cacheKey]) {
            return DrawingUtils.rgbaCache[cacheKey];
        }

        color = DrawingUtils.CssNamedColorToHex(color);
        if (opacity === 1 && typeof color === 'string') {
            DrawingUtils.rgbaCache[cacheKey] = color;
            return color;
        }
        let rgba: string;
        if (typeof color === 'string' && color[0] === '#') {
            let c; // From https://stackoverflow.com/questions/21646738/convert-hex-to-rgba
            if (/^#([A-Fa-f0-9]{3}){1,2}$/.test(color)) {
                c = color.substring(1);
                if (c.length == 3) {
                    c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
                }
                c = '0x' + c;
                rgba =
                    'rgba(' +
                    [(c >> 16) & 255, (c >> 8) & 255, c & 255].join(',') +
                    ',' +
                    opacity +
                    ')';
            } else {
                throw new Error('Bad Hex');
            }
        } else if (typeof color === 'object') {
            if ('r' in color) {
                rgba = 'rgba(' + color.r + ',' + color.g + ',' + color.b + ',' + opacity + ')';
            } else if ('h' in color) {
                const rgb = DrawingUtils.hslToRgb(color.h / 360, color.s, color.l);
                rgba = 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',' + opacity + ')';
            }
        } else if (color.substr(0, 4) === 'rgb(') {
            rgba = color.substr(0, color.length - 1).replace('rgb', 'rgba') + ', ' + opacity + ')';
        }
        DrawingUtils.rgbaCache[cacheKey] = rgba;
        return rgba;
    }

    // From https://stackoverflow.com/questions/2353211/hsl-to-rgb-color-conversion
    static hslToRgb(h, s, l) {
        var r, g, b;

        if (s == 0) {
            r = g = b = l; // achromatic
        } else {
            var hue2rgb = function hue2rgb(p, q, t) {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1 / 6) return p + (q - p) * 6 * t;
                if (t < 1 / 2) return q;
                if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
                return p;
            };

            var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            var p = 2 * l - q;
            r = hue2rgb(p, q, h + 1 / 3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1 / 3);
        }

        return {
            r: Math.round(r * 255),
            g: Math.round(g * 255),
            b: Math.round(b * 255),
        };
    }

    static CssNamedColorToHex(color: any) {
        if (typeof color === 'string' && COLOR_HEXES[color.toUpperCase()]) {
            return COLOR_HEXES[color.toUpperCase()];
        }
        return color;
    }

    /**
     * Basic implementation to get a sense of specificity. Numbers are completely made up.
     * Should eventually be more sophisticated, e.g. using https://github.com/keeganstreet/specificity.
     * @param selector CSS rule as string.
     */
    static getCssRuleSpecificityNumber(selector: string) {
        let specificity = 0;

        selector = selector.replace(/ >/g, '>').replace(/> /g, '>');

        const parts = [].concat.apply(
            [],
            selector.split(' ').map((part) => part.split('>'))
        );

        // Rough logic: the more stuff, the more specific. IDs and classes are more specific than other things.
        for (const part of parts) {
            specificity += 100;
            const start = part[0];

            if (start === '#') {
                specificity += 1000;
            } else if (start === '.') {
                // More classes are more specific, but never more specific than an ID.
                const countClasses = part.split('.').length - 1;
                specificity += Math.min(900, countClasses * 100);
            }
        }

        return specificity;
    }
}

const COLOR_HEXES = {
    ALICEBLUE: '#F0F8FF',
    ANTIQUEWHITE: '#FAEBD7',
    AQUA: '#00FFFF',
    AQUAMARINE: '#7FFFD4',
    AZURE: '#F0FFFF',
    BEIGE: '#F5F5DC',
    BISQUE: '#FFE4C4',
    BLACK: '#000000',
    BLANCHEDALMOND: '#FFEBCD',
    BLUE: '#0000FF',
    BLUEVIOLET: '#8A2BE2',
    BROWN: '#A52A2A',
    BURLYWOOD: '#DEB887',
    CADETBLUE: '#5F9EA0',
    CHARTREUSE: '#7FFF00',
    CHOCOLATE: '#D2691E',
    CORAL: '#FF7F50',
    CORNFLOWERBLUE: '#6495ED',
    CORNSILK: '#FFF8DC',
    CRIMSON: '#DC143C',
    CYAN: '#00FFFF',
    DARKBLUE: '#00008B',
    DARKCYAN: '#008B8B',
    DARKGOLDENROD: '#B8860B',
    DARKGRAY: '#A9A9A9',
    DARKGREY: '#A9A9A9',
    DARKGREEN: '#006400',
    DARKKHAKI: '#BDB76B',
    DARKMAGENTA: '#8B008B',
    DARKOLIVEGREEN: '#556B2F',
    DARKORANGE: '#FF8C00',
    DARKORCHID: '#9932CC',
    DARKRED: '#8B0000',
    DARKSALMON: '#E9967A',
    DARKSEAGREEN: '#8FBC8F',
    DARKSLATEBLUE: '#483D8B',
    DARKSLATEGRAY: '#2F4F4F',
    DARKSLATEGREY: '#2F4F4F',
    DARKTURQUOISE: '#00CED1',
    DARKVIOLET: '#9400D3',
    DEEPPINK: '#FF1493',
    DEEPSKYBLUE: '#00BFFF',
    DIMGRAY: '#696969',
    DIMGREY: '#696969',
    DODGERBLUE: '#1E90FF',
    FIREBRICK: '#B22222',
    FLORALWHITE: '#FFFAF0',
    FORESTGREEN: '#228B22',
    FUCHSIA: '#FF00FF',
    GAINSBORO: '#DCDCDC',
    GHOSTWHITE: '#F8F8FF',
    GOLD: '#FFD700',
    GOLDENROD: '#DAA520',
    GRAY: '#808080',
    GREY: '#808080',
    GREEN: '#008000',
    GREENYELLOW: '#ADFF2F',
    HONEYDEW: '#F0FFF0',
    HOTPINK: '#FF69B4',
    INDIANRED: '#CD5C5C',
    INDIGO: '#4B0082',
    IVORY: '#FFFFF0',
    KHAKI: '#F0E68C',
    LAVENDER: '#E6E6FA',
    LAVENDERBLUSH: '#FFF0F5',
    LAWNGREEN: '#7CFC00',
    LEMONCHIFFON: '#FFFACD',
    LIGHTBLUE: '#ADD8E6',
    LIGHTCORAL: '#F08080',
    LIGHTCYAN: '#E0FFFF',
    LIGHTGOLDENRODYELLOW: '#FAFAD2',
    LIGHTGRAY: '#D3D3D3',
    LIGHTGREY: '#D3D3D3',
    LIGHTGREEN: '#90EE90',
    LIGHTPINK: '#FFB6C1',
    LIGHTSALMON: '#FFA07A',
    LIGHTSEAGREEN: '#20B2AA',
    LIGHTSKYBLUE: '#87CEFA',
    LIGHTSLATEGRAY: '#778899',
    LIGHTSLATEGREY: '#778899',
    LIGHTSTEELBLUE: '#B0C4DE',
    LIGHTYELLOW: '#FFFFE0',
    LIME: '#00FF00',
    LIMEGREEN: '#32CD32',
    LINEN: '#FAF0E6',
    MAGENTA: '#FF00FF',
    MAROON: '#800000',
    MEDIUMAQUAMARINE: '#66CDAA',
    MEDIUMBLUE: '#0000CD',
    MEDIUMORCHID: '#BA55D3',
    MEDIUMPURPLE: '#9370DB',
    MEDIUMSEAGREEN: '#3CB371',
    MEDIUMSLATEBLUE: '#7B68EE',
    MEDIUMSPRINGGREEN: '#00FA9A',
    MEDIUMTURQUOISE: '#48D1CC',
    MEDIUMVIOLETRED: '#C71585',
    MIDNIGHTBLUE: '#191970',
    MINTCREAM: '#F5FFFA',
    MISTYROSE: '#FFE4E1',
    MOCCASIN: '#FFE4B5',
    NAVAJOWHITE: '#FFDEAD',
    NAVY: '#000080',
    OLDLACE: '#FDF5E6',
    OLIVE: '#808000',
    OLIVEDRAB: '#6B8E23',
    ORANGE: '#FFA500',
    ORANGERED: '#FF4500',
    ORCHID: '#DA70D6',
    PALEGOLDENROD: '#EEE8AA',
    PALEGREEN: '#98FB98',
    PALETURQUOISE: '#AFEEEE',
    PALEVIOLETRED: '#DB7093',
    PAPAYAWHIP: '#FFEFD5',
    PEACHPUFF: '#FFDAB9',
    PERU: '#CD853F',
    PINK: '#FFC0CB',
    PLUM: '#DDA0DD',
    POWDERBLUE: '#B0E0E6',
    PURPLE: '#800080',
    REBECCAPURPLE: '#663399',
    RED: '#FF0000',
    ROSYBROWN: '#BC8F8F',
    ROYALBLUE: '#4169E1',
    SADDLEBROWN: '#8B4513',
    SALMON: '#FA8072',
    SANDYBROWN: '#F4A460',
    SEAGREEN: '#2E8B57',
    SEASHELL: '#FFF5EE',
    SIENNA: '#A0522D',
    SILVER: '#C0C0C0',
    SKYBLUE: '#87CEEB',
    SLATEBLUE: '#6A5ACD',
    SLATEGRAY: '#708090',
    SLATEGREY: '#708090',
    SNOW: '#FFFAFA',
    SPRINGGREEN: '#00FF7F',
    STEELBLUE: '#4682B4',
    TAN: '#D2B48C',
    TEAL: '#008080',
    THISTLE: '#D8BFD8',
    TOMATO: '#FF6347',
    TURQUOISE: '#40E0D0',
    VIOLET: '#EE82EE',
    WHEAT: '#F5DEB3',
    WHITE: '#FFFFFF',
    WHITESMOKE: '#F5F5F5',
    YELLOW: '#FFFF00',
    YELLOWGREEN: '#9ACD32',
};
