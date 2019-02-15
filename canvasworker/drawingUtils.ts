export default class DrawingUtils {
    static parseTransform(transform: string|{}) {
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
            
            const scale = /\s*scale\(([-0-9.]+)\)/.exec(transformString);
            if (scale) {
                transformObject.scaleX = parseFloat(scale[1]);
                transformObject.scaleY = parseFloat(scale[1]);
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
            
            const translateScale = /\s*translate\(([-0-9.]+),([-0-9.]+)\)scale\(([-0-9.]+)\)/.exec(transformString);
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
    
    static colorToRgba(color: string|{r: number, g: number, b: number}, opacity = 1): string {
        color = DrawingUtils.CssNamedColorToHex(color);
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
        } else if(typeof color === 'object' && Object.keys(color).length === 3) {
            return 'rgba(' + color.r + ',' + color.g + ',' + color.b + ',' + opacity + ')';
        }
        return <string> color;
    }

    static CssNamedColorToHex(color: any) {
        if(color === 'steelblue') {
            return '#4682b4';
        }
        //TODO add more colors.
        return color;
    }
}