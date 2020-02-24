export type Transformation = {
    translateX: number,
    translateY: number,
    scaleX: number,
    scaleY: number,
    rotate: number,
    translateBeforeScale: boolean
}

export default class DrawingUtils {
    static parseTransform(transform: string|{}): Transformation {
        const transformObject = {translateX: 0, translateY: 0, scaleX: 1, scaleY: 1, rotate: 0, translateBeforeScale: false};
        
        if (transform) {
            if(typeof transform !== "string") {
                transformObject.scaleX = transform['k'];
                transformObject.scaleY = transform['k'];
                transformObject.translateX = transform['x'];
                transformObject.translateY = transform['y'];
                return transformObject;
            }
            let transformString = <string> transform;
            transformString = transformString.replace(/ /g, '');
            
            //let translate  = /translate\((\d+),(\d+)\)/.exec(transform);
            const translate = /\s*translate\(([-0-9.]+),([-0-9.]+)\)/.exec(transformString);
            if (translate) {
                transformObject.translateX = parseFloat(translate[1]);
                transformObject.translateY = parseFloat(translate[2]);
            }
            else {
                //console.error('no translate found', transform);
            }
            
            const scale = /\s*scale\(([-0-9.]+)(,[-0-9.]+)?\)/.exec(transformString);
            if (scale) {
                transformObject.scaleX = parseFloat(scale[1]);
                transformObject.scaleY = scale[2] ? parseFloat(scale[2].substr(1)) : parseFloat(scale[1]);
            }
            else {
                //console.error('no scale found', transform);
            }
            
            const rotate = /\s*rotate\(([-0-9.]+)\)/.exec(transformString);
            if (rotate) {
                transformObject.rotate = parseFloat(rotate[1]);
            }
            else {
                //console.error('no rotate found', transform);
            }
            
            const translateScale = /\s*translate\(([-0-9.]+),([-0-9.]+)\)scale\(([-0-9.,]+)\)/.exec(transformString);
            if (translateScale) {
                transformObject.translateBeforeScale = true;
            }
            
            const matrix = /\s*matrix\(([-0-9.]+),([-0-9.]+),([-0-9.]+),([-0-9.]+),([-0-9.]+),([-0-9.]+)\)/.exec(transformString);
            if(matrix) {
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
            translateBeforeScale: false
        };
        //TODO: consider translateBeforeScale
    }

    static convertSizeToPx(size: string|number, fallback = true): number|undefined {
        const defaultValue = fallback ? 14 : undefined;
        if(size === undefined) {
            return defaultValue;
        }
        if(typeof size === "number") {
            return size;
        }
        if(size.substr(-2) === 'em') {
            return Math.round(parseFloat(size) * 12);
        }
        if(size.substr(-2) === 'px') {
            return parseInt(size);
        }
        if(size.match(/^[0-9]+$/)) {
            return parseInt(size);
        }
        console.warn('size in unsupported format: ', size);
        return defaultValue;
    }
    
    static colorToRgba(color: string|{r: number, g: number, b: number}|{h: number, s: number, l: number},
                       opacity: string|number = 1,
                       defaultColor ='none'): string {
        if(color === 'none') {
            return color;
        }
        if(!color) {
            return defaultColor;
        }
        color = DrawingUtils.CssNamedColorToHex(color);
        if(opacity === 1 && typeof color === 'string') {
            return color;
        }
        if(typeof color === 'string' && color[0] === '#') {
            let c; // From https://stackoverflow.com/questions/21646738/convert-hex-to-rgba
            if(/^#([A-Fa-f0-9]{3}){1,2}$/.test(color)){
                c = color.substring(1);
                if(c.length == 3){
                    c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
                }
                c = '0x' + c;
                return 'rgba('+[(c>>16)&255, (c>>8)&255, c&255].join(',')+',' + opacity + ')';
            }
            throw new Error('Bad Hex');
        } else if(typeof color === 'object') {
            if('r' in color) {
                return 'rgba(' + color.r + ',' + color.g + ',' + color.b + ',' + opacity + ')';
            }
            if('h' in color) {
                const rgb = DrawingUtils.hslToRgb(color.h / 360, color.s, color.l);
                return 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',' + opacity + ')';
            }
        } else if(color.substr(0, 4) === 'rgb(') {
            return color.substr(0, color.length - 1).replace('rgb','rgba') +
                ', ' + opacity + ')';
        }
        return color;
    }

    // From https://stackoverflow.com/questions/2353211/hsl-to-rgb-color-conversion
    static hslToRgb(h, s, l) {
        var r, g, b;

        if(s == 0){
            r = g = b = l; // achromatic
        } else {
            var hue2rgb = function hue2rgb(p, q, t){
                if(t < 0) t += 1;
                if(t > 1) t -= 1;
                if(t < 1/6) return p + (q - p) * 6 * t;
                if(t < 1/2) return q;
                if(t < 2/3) return p + (q - p) * (2/3 - t) * 6;
                return p;
            };

            var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            var p = 2 * l - q;
            r = hue2rgb(p, q, h + 1/3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1/3);
        }

        return {r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255)};
    }

    static CssNamedColorToHex(color: any) { // TODO put a somewhat complete list here..
        if(color === 'red') {
            return '#ff0000';
        }
        if(color === 'steelblue') {
            return '#4682b4';
        }
        if(color === 'black') {
            return '#000000';
        }
        //TODO add more colors.
        return color;
    }

    /**
     * Basic implementation to get a sense of specificity. Numbers are completely made up.
     * Should eventually be more sophisticated, e.g. using https://github.com/keeganstreet/specificity.
     * @param selector CSS rule as string.
     */
    static getCssRuleSpecificityNumber(selector: string) {
        let specificity = 0;

        selector = selector
            .replace(/ >/g, '>')
            .replace(/> /g, '>');

        const parts = [].concat.apply([], selector.split(' ')
            .map(part => part.split('>')));

        // Rough logic: the more stuff, the more specific. IDs and classes are more specific than other things.
        for(const part of parts) {
            specificity += 100;
            const start = part[0];

            if(start === '#') {
                specificity += 1000;
            } else if(start === '.') {
                // More classes are more specific, but never more specific than an ID.
                const countClasses = part.split('.').length - 1;
                specificity += Math.min(900, countClasses * 100);
            }
        }

        return specificity;
    }
}