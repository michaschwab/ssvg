import {VdomNode} from "../util/vdom/vdom";
import {VdomManager} from "../util/vdom/vdom-manager";
import DrawingUtils from "./drawingUtils";
import CanvasWorker from "./canvasworker";

type DrawMode = 'start'|'normal'|'end'|'forcesingle';

export default class Canvasrenderer implements CanvasWorker {
    
    private ctx: CanvasRenderingContext2D;
    private parentValues: {[prop: string]: string|number} = {};
    
    constructor(private vdom: VdomManager, private canvas: HTMLCanvasElement,
                private forceSingle = false, private onDrawn = () => {}) {
        const ctx = canvas.getContext('2d');
        if(!ctx) throw new Error('could not create canvas context');
        
        this.ctx = ctx;
        this.ctx.scale(this.vdom.data.scale, this.vdom.data.scale);
        this.ctx.save();
        
        this.draw();
        
        setTimeout(() => {
            console.log(this.forceSingle, this.vdom.data);
            this.draw();
        }, 1000);
    }
    
    private lastFullSecond = 0;
    private countSinceLastFullSecond = 0;
    
    draw() {
        const ctx = this.ctx;
        
        ctx.restore();
        ctx.save();
        
        //ctx.fillStyle = '#fff';
        //ctx.fillRect(0, 0, this.vdom.data.width, this.vdom.data.height);
        ctx.clearRect(0, 0, this.vdom.data.width, this.vdom.data.height);
    
        //this.lastDrawn = null;
        this.drawLine(null, 'start');
        this.drawCircle(null, 'start');
        this.drawRect(null, 'start');
        this.drawText(null, 'start');
        this.drawImage(null, 'start');

        this.drawNodeAndChildren(this.vdom.data, this.forceSingle);

        this.drawLine(null, 'end');
        this.drawCircle(null, 'end');
        this.drawRect(null, 'end');
        this.drawText(null, 'end');
        this.drawImage(null, 'end');
        
        this.onDrawn();
    
        const fullSecond = Math.round(performance.now() / 1000);
        if(fullSecond !== this.lastFullSecond) {
            this.lastFullSecond = fullSecond;
            //console.log(this.countSinceLastFullSecond);
            this.countSinceLastFullSecond = 0;
        }
        this.countSinceLastFullSecond++;
    }
    
    private drawNodeAndChildren(elData: VdomNode, forceSingle: boolean, drawClip?: Path2D) {
        if(elData.type === 'clippath' && !drawClip) {
            return;
        }

        const ctx = this.ctx;
        const parentValuesBackup = {...this.parentValues};

        if(!drawClip) {
            ctx.save();
        }

        const hasTransformed = this.applyTransform(elData.transform);

        if(elData.transform || drawClip) {
            forceSingle = true;
        }

        if(elData['clip-path']) {
            if(elData['clip-path'].substr(0, 5) === 'url(#') {
                const clipPathId = elData['clip-path'].substr(5, elData['clip-path'].length - 6);
                const clipNode = this.vdom.getNodeById(clipPathId);
                forceSingle = true;

                if(!clipNode) {
                    //safeErrorLog('clip node not found', elData['clip-path'], clipPathId, this.vdom.data)
                } else {
                    const path = new Path2D();
                    this.drawNodeAndChildren(clipNode, forceSingle, path);
                    ctx.clip(path);
                }
            } else {
                safeErrorLog('clip path format not supported:', elData['clip-path']);
            }
        }

        if(!elData.style.display || elData.style.display !== 'none') {
            if(!forceSingle) {
                this.drawSingleNode(elData, 'normal', drawClip);
            } else {
                this.drawSingleNode(elData, 'forcesingle', drawClip);
            }
        }

        const fill = this.getFillStyle(elData, 'undefined');
        if(fill !== 'undefined') {
            this.parentValues['fill'] = fill;
        }
        const stroke = this.getStrokeStyle(elData, 'undefined');
        if(stroke !== 'undefined') {
            this.parentValues['stroke'] = stroke;
        }
        this.parentValues['opacity'] = elData.opacity;

        if(elData.children) {
            for(let i = 0; i < elData.children.length; i++) {
                this.drawNodeAndChildren(elData.children[i], forceSingle, drawClip);
            }
        }

        if(!drawClip) {
            //safeLog('restoring ctx', elData);
            ctx.restore();
            this.parentValues = parentValuesBackup;
        }

        if(hasTransformed) {
            //ctx.restore();
        }
    }
    
    private drawSingleNode(elData: VdomNode, mode: DrawMode = 'normal', path?: Path2D) {
        const type: string = elData.type;
        const drawFct = this['draw' + type.substr(0,1).toUpperCase() + type.substr(1)];
        if(!drawFct) {
            return console.error('no draw function yet for ', type);
        }
        drawFct.call(this, elData, mode, path);
    }

    private drawClippath(elData: VdomNode) {
        //safeLog('clippaths can not be rendered yet.')
    }

    private drawSvg() {}
    private drawTitle() {}
    private drawG() {}
    
    private circlesByColor: {[color: string]: VdomNode[]} = {};
    private drawCircle(elData: VdomNode, mode: DrawMode = 'normal', path?: Path2D) {
        if(mode === 'normal') {
            let fill = this.getFillStyle(elData, '#000');
            const stroke = this.getStrokeStyle(elData);
            const handle = fill + ';' + stroke;
            if(!this.circlesByColor[handle]) {
                this.circlesByColor[handle] = [];
            }
            this.circlesByColor[handle].push(elData);
        }
        if(mode === 'start') {
            this.circlesByColor = {};
            return;
        }
        if(mode === 'end') {
            for(let fillAndStrokeColor in this.circlesByColor) {
                if(this.circlesByColor.hasOwnProperty(fillAndStrokeColor)) {
                    const split = fillAndStrokeColor.split(';');
                    const fillColor = split[0];
                    const strokeColor = split[1];

                    this.ctx.fillStyle = fillColor;
                    let sampleData = this.circlesByColor[fillAndStrokeColor][0];
                    const lineWidth = this.getStrokeWidth(sampleData);
                    this.ctx.lineWidth = lineWidth !== undefined ? lineWidth : 1;
                    this.ctx.strokeStyle = strokeColor;

                    this.ctx.beginPath();
                    for(let elData of this.circlesByColor[fillAndStrokeColor]) {
                        // Round values so that paths are connected correctly and there are no rendering glitches
                        const cx = Math.round(this.vdom.get(elData, 'cx')) || 0;
                        const cy = Math.round(this.vdom.get(elData, 'cy')) || 0;
                        const r = Math.round(this.vdom.get(elData, 'r'));
                        this.ctx.save();
                        this.applyTransform(elData.transform);
                        this.ctx.moveTo(cx + r, cy);
                        this.ctx.arc(cx, cy, r, 0, 2 * Math.PI);
                        this.ctx.restore();
                        //this.ctx.restore();
                    }

                    if(fillColor !== 'none'){
                        this.ctx.fill();
                    }

                    if(strokeColor && strokeColor !== 'none') {
                        this.ctx.stroke();
                    }
                }
            }
            return;
        }
        if(mode === 'forcesingle') {
            let fill = this.getFillStyle(elData, '#000');
            const strokeStyle = this.getStrokeStyle(elData);

            const cx = this.vdom.get(elData, 'cx') || 0;
            const cy = this.vdom.get(elData, 'cy') || 0;

            this.ctx.beginPath();
            this.ctx.fillStyle = fill;
            this.ctx.strokeStyle = strokeStyle;
            this.ctx.lineWidth = this.getStrokeWidth(elData);
            this.ctx.moveTo(cx + elData.r, cy);
            const context = path ? path : this.ctx;
            context.arc(cx, cy, elData.r, 0, 2 * Math.PI);
            if(fill !== 'none' && !path){
                this.ctx.fill();
            }

            if(strokeStyle && strokeStyle !== 'none' && !path) {
                this.ctx.stroke();
            }
        }
    }

    private getFillStyle(node: VdomNode, defaultColor = 'none'): string {
        let fill = this.getAttributeStyleCss(node, 'fill');
        let opacity = this.getAttributeStyleCss(node, 'opacity') || 1;
        const fillOpacity = this.getAttributeStyleCss(node, 'fill-opacity')

        if(fillOpacity) {
            opacity *= fillOpacity;
        }

        let defaultCol = '';
        if(this.parentValues['fill']) {
            defaultCol = this.parentValues['fill'] as string;
        }
        if(this.parentValues['style;fill']) {
            defaultCol = this.parentValues['style;fill'] as string;
        }
        if(!this.parentValues['fill'] && !this.parentValues['style;fill']) {
            defaultCol = defaultColor;
        }

        fill = DrawingUtils.colorToRgba(fill, opacity, defaultCol);
        return fill;
    }

    private getAttributeStyleCss(node: VdomNode, style: string) {
        if(node.style[style]) {
            return node.style[style];
        } else {
            let value = node[style];

            let highestSpec = -1;
            for(const selector in node.css) {
                if(node.css[selector][style]) {
                    const specificity = DrawingUtils.getCssRuleSpecificityNumber(selector);
                    if(specificity > highestSpec) {
                        value = node.css[selector][style];
                        highestSpec = specificity;
                    }
                }
            }
            return value;
        }
    }

    private getStrokeStyle(node: VdomNode, defaultColor = 'none'): string {
        const stroke = this.getAttributeStyleCss(node, 'stroke');

        if(stroke !== undefined) {
            const strokeOpacity = this.getAttributeStyleCss(node, 'stroke-opacity');
            return DrawingUtils.colorToRgba(stroke, strokeOpacity);
        }
        return defaultColor;
    }

    private getStrokeWidth(node: VdomNode) {
        const width = this.getAttributeStyleCss(node, 'stroke-width');
        return width === undefined ? undefined : parseFloat(width);
    }

    private rectsByColor = {};

    private drawRect(elData: VdomNode, mode: DrawMode = 'normal', path?: Path2D) {
        if(mode === 'normal') {
            let fill = this.getFillStyle(elData, '#000');
            const stroke = this.getStrokeStyle(elData);
            const handle = fill + ';' + stroke;
            if(!this.rectsByColor[handle]) {
                this.rectsByColor[handle] = [];
            }
            this.rectsByColor[handle].push(elData);
        }
        if(mode === 'start') {
            this.rectsByColor = {};
            return;
        }
        if(mode === 'end') {
            for(let fillAndStrokeColor in this.rectsByColor) {
                if(this.rectsByColor.hasOwnProperty(fillAndStrokeColor)) {
                    const split = fillAndStrokeColor.split(';');
                    const fillColor = split[0];
                    const strokeColor = split[1];
                    this.ctx.fillStyle = fillColor;

                    let sampleData = this.rectsByColor[fillAndStrokeColor][0];
                    const lineWidth = this.getStrokeWidth(sampleData);
                    this.ctx.lineWidth = lineWidth !== undefined ? lineWidth : 1;
                    this.ctx.strokeStyle = strokeColor;

                    this.ctx.beginPath();
                    for(let elData of this.rectsByColor[fillAndStrokeColor]) {
                        // Round values so that paths are connected correctly and there are no rendering glitches
                        const x = Math.round(this.vdom.get(elData, 'x')) || 0;
                        const y = Math.round(this.vdom.get(elData, 'y')) || 0;
                        this.ctx.save();
                        this.applyTransform(elData.transform);
                        this.ctx.moveTo(x, y);
                        this.ctx.rect(x, y, elData.width, elData.height);
                        this.ctx.restore();
                        //this.ctx.restore();
                    }
                    if(fillColor !== 'none'){
                        this.ctx.fill();
                    }

                    if(strokeColor && strokeColor !== 'none') {
                        this.ctx.stroke();
                    }
                }
            }
            return;
        }
        if(mode === 'forcesingle') {
            let fill = this.getFillStyle(elData, '#000');
            const stroke = this.getStrokeStyle(elData);

            const x = this.vdom.get(elData, 'x') || 0;
            const y = this.vdom.get(elData, 'y') || 0;

            if(fill && fill !== 'none' && !path) {
                this.ctx.fillStyle = fill;
                this.ctx.fillRect(x, y, elData.width, elData.height);
            }
            if(path) {
                path.rect(x, y, elData.width, elData.height);
            }

            if(stroke !== undefined && !path) {
                this.ctx.strokeStyle = stroke;
                this.ctx.beginPath();
                this.ctx.rect(x, y, elData.width, elData.height);
                this.ctx.stroke();
            }
        }
    }

    private drawTexts: VdomNode[] = [];

    private drawText(node: VdomNode, mode: DrawMode = 'normal', isClip = false) {
        const drawSingle = (elData: VdomNode) => {
            if(elData.text === '') {
                return;
            }
            let fontFamily = this.getAttributeStyleCss(elData, 'font-family') || 'Times New Roman';

            let fontSize = '16px';
            const customSize = this.getAttributeStyleCss(elData, 'font-size');
            if(customSize) {
                fontSize = DrawingUtils.convertSizeToPx(customSize) + 'px';
            }
            let font = this.getAttributeStyleCss(elData, 'font');
            if(!font) {
                font = fontSize + ' ' + fontFamily;
            }
            let align = this.getAttributeStyleCss(elData, 'text-anchor');
            if(align) {
                if(align === 'middle') {
                    align = 'center';
                }
                this.ctx.textAlign = align;
            }
            let fill = this.getAttributeStyleCss(elData, 'fill');
            if(!fill) fill = '#000';
            this.ctx.font = font;
            this.ctx.fillStyle = fill;
            let x = this.vdom.get(elData, 'x') || 0;
            let y = this.vdom.get(elData, 'y') || 0;
            let dx = DrawingUtils.convertSizeToPx(elData.dx, false) || 0;
            let dy = DrawingUtils.convertSizeToPx(elData.dy, false) || 0;
            this.ctx.fillText(elData.text, x + dx, y + dy);
        };
        if(mode === 'start') {
            this.drawTexts = [];
            return;
        }
        if(mode === 'normal') {
            this.drawTexts.push(node);
            return;
        }
        if(mode === 'forcesingle') {
            return drawSingle(node);
        }
        if(mode === 'end') {
            for(const currentNode of this.drawTexts) {
                drawSingle(currentNode);
            }
            return;
        }
    }

    private drawImages: VdomNode[] = [];

    private drawImage(node: VdomNode, mode: DrawMode = 'normal') {
        const drawSingle = (elData: VdomNode) => {
            if(elData.href === '') {
                return;
            }
            let fill = elData['fill'] ? elData['fill'] : elData.style['fill'];
            if(!fill) fill = '#000';
            this.ctx.fillStyle = fill;
            let x = this.vdom.get(elData, 'x') || 0;
            let y = this.vdom.get(elData, 'y') || 0;
            let width = elData.width || 0;
            let height = elData.height || 0;
            if(elData.image) {
                try {
                    this.ctx.drawImage(elData.image, x, y, width, height);
                } catch(e) {
                    console.log(e);
                }
            }
        };
        if(mode === 'start') {
            this.drawImages = [];
            return;
        }
        if(mode === 'normal') {
            this.drawImages.push(node);
            return;
        }
        if(mode === 'forcesingle') {
            return drawSingle(node);
        }
        if(mode === 'end') {
            for(const currentNode of this.drawImages) {
                drawSingle(currentNode);
            }
            return;
        }
    }

    private drawPath(elData: VdomNode, mode: DrawMode = 'normal', path?: Path2D) {
        if(mode !== 'normal' && mode !== 'forcesingle') return;

        const fill = this.getFillStyle(elData, '#000');
        const stroke = this.getStrokeStyle(elData);
        const strokeWidth = this.getStrokeWidth(elData);

        let p = new Path2D(elData.d);
        this.ctx.fillStyle = fill;
        if(stroke !== undefined && stroke !== 'none') {
            if(strokeWidth !== undefined) {
                this.ctx.lineWidth = strokeWidth;
            }
            this.ctx.strokeStyle = stroke;

            const lineJoin = this.getAttributeStyleCss(elData, 'stroke-linejoin')

            if(lineJoin) {
                if(lineJoin === 'bevel' || lineJoin === 'round' || lineJoin === 'miter') {
                    this.ctx.lineJoin = lineJoin;
                } else {
                    console.error('unknown line join value:', lineJoin)
                }
            }
            if(!path) {
                this.ctx.stroke(p);
            }
        }

        if(fill && fill !== 'none' && !path) {
            this.ctx.fill(p);
        }
        if(path) {
            path.addPath(p);
        }
    }
    
    private drawTspan(elData: VdomNode, mode: DrawMode = 'normal') {
        if(mode !== 'normal' && mode !== 'forcesingle') return;
        
        this.ctx.font = "10px Arial";
        this.ctx.fillStyle = "#000000";
        const textAlign = <CanvasTextAlign> (elData.style.textAnchor === "middle" ? "center" : elData.style.textAnchor);
        this.ctx.textAlign = textAlign;
        this.ctx.fillText(elData.text, this.vdom.get(elData, 'x'), this.vdom.get(elData, 'y'));
    }

    private drawTextpath(elData: VdomNode) {
        console.warn('no draw function yet for textpath');
    }

    private linesByColor: {[color: string]: VdomNode[]} = {};
    private drawLine(elData, mode: DrawMode = 'normal') {
        if(this.vdom.data.scale > 1) {
            //mode = 'forcesingle';
            // In my tests, drawing a long connected path is very slow for high DPI devices.
        }
        if(mode === 'normal') {
            const stroke = this.getStrokeStyle(elData);
            const width = this.getStrokeWidth(elData);
            if(stroke === 'none' || width === 0) {
                return;
            }
            const selector = `${stroke};${width}`;
            if(!this.linesByColor[selector]) {
                this.linesByColor[selector] = [];
            }
            this.linesByColor[selector].push(elData);
        }
        if(mode === 'start') {
            this.linesByColor = {};
            return;
        }
        if(mode === 'end') {
            //safeLog(Object.keys(this.linesByColor), this.linesByColor);
            for(let selector in this.linesByColor) {
                if(this.linesByColor.hasOwnProperty(selector)) {
                    const split = selector.split(';');
                    const strokeColor = split[0];
                    const width = split[1];

                    this.ctx.strokeStyle = strokeColor;
                    this.ctx.lineWidth = parseFloat(width);

                    this.ctx.beginPath();
                    for(let elData of this.linesByColor[selector]) {
                        if(elData.transform) {
                            this.ctx.save();
                            this.applyTransform(elData.transform);
                        }

                        const [x1, x2, y1, y2] = this.vdom.get(elData, ['x1', 'x2', 'y1', 'y2'])
                            .map(val => Math.round(val) || 0);

                        this.ctx.moveTo(x1, y1);
                        this.ctx.lineTo(x2, y2);

                        if(elData.transform) {
                            //this.ctx.restore();
                            this.ctx.restore();
                        }
                    }

                    this.ctx.stroke();
                }
            }
            return;
        }
        if(mode === 'forcesingle') {
            this.ctx.beginPath();

            const [x1, x2, y1, y2] = this.vdom.get(elData, ['x1', 'x2', 'y1', 'y2'])
                .map(val => Math.round(val) || 0);

            this.ctx.moveTo(x1, y1);
            this.ctx.lineTo(x2, y2);

            this.ctx.strokeStyle = this.getStrokeStyle(elData);
            this.ctx.lineWidth = this.getStrokeWidth(elData);
            //safeLog(stroke, this.ctx.strokeStyle);
            this.ctx.stroke();
        }
    }

    private drawDefs(node: VdomNode) {
        //TODO figure out.
    }

    private drawMarker(node: VdomNode) {
        //TODO figure out.
    }
    
    private applyTransform(transformString: string) {
        const transform = transformString ? DrawingUtils.parseTransform(transformString) : null;
        if(transform) {
            if(!transform.rotateLast) {
                this.ctx.rotate(transform.rotate * Math.PI / 180);
            }

            const x = transform.translateBeforeScale ? transform.translateX : transform.translateX * transform.scaleX;
            const y = transform.translateBeforeScale ? transform.translateY : transform.translateY * transform.scaleY;
            this.ctx.transform(transform.scaleX, 0, 0, transform.scaleY, x, y);

            if(transform.rotateLast) {
                this.ctx.rotate(transform.rotate * Math.PI / 180);
            }

            return true;
        }
        return false;
    }
}


let safeLogCount = 0;
function safeLog(...logContents) {
    
    if(safeLogCount < 300) {
        safeLogCount++;
        console.log(...logContents);
    }
}
function safeErrorLog(...logContents) {
    
    if(safeLogCount < 50) {
        safeLogCount++;
        console.error(...logContents);
    }
}
