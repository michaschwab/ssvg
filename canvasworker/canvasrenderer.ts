import {VdomNode} from "../util/vdom/vdom";
import {VdomManager} from "../util/vdom/vdom-manager";
import DrawingUtils from "./drawingUtils";
import CanvasWorker from "./canvasworker";

type DrawMode = 'start'|'normal'|'end'|'forcesingle';

export default class Canvasrenderer implements CanvasWorker {
    
    private ctx: CanvasRenderingContext2D;
    
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
    
    private drawNodeAndChildren(elData: VdomNode, forceSingle: boolean) {
        const ctx = this.ctx;

        ctx.save();
        const hasTransformed = this.applyTransform(elData.transform);

        if(elData.transform) {
            forceSingle = true;
        }
        
        if(elData.type && elData.type !== 'g' && (!elData.style.display || elData.style.display !== 'none')) {
            if(elData.type === 'title') {
                return;
            }
            
            if(!forceSingle) {
                /*if(!this.lastDrawn || (this.lastDrawn && this.lastDrawn.type !== elData.type)) {
                    if(this.lastDrawn) {
                        this.drawSingleNode(this.lastDrawn, 'end');
                    }
                    this.drawSingleNode(elData, 'start');
                }*/
    
                this.drawSingleNode(elData);
            } else {
                this.drawSingleNode(elData, 'forcesingle');
            }
            
            //this.lastDrawn = elData;
        }
        
        if(elData.children) {
            for(let i = 0; i < elData.children.length; i++) {
                this.drawNodeAndChildren(elData.children[i], forceSingle);
            }
        }
        ctx.restore();
        if(hasTransformed) {
            //ctx.restore();
        }
    }
    
    private drawSingleNode(elData: VdomNode, mode: DrawMode = 'normal') {
        const type: string = elData.type;
        const drawFct = this['draw' + type.substr(0,1).toUpperCase() + type.substr(1)];
        if(!drawFct) {
            return console.error('no draw function yet for ', type);
        }
        drawFct.call(this, elData, mode);
    }

    private drawClippath(elData: VdomNode) {
        console.warn('clippaths can not be rendered yet.')
    }
    
    private circlesByColor: {[color: string]: VdomNode[]} = {};
    private drawCircle(elData: VdomNode, mode: DrawMode = 'normal') {
        if(mode === 'normal') {
            let fill = elData.style.fill ? elData.style.fill : elData.fill;
            let fillOpacity = elData.style['fill-opacity'] ? elData.style['fill-opacity'] : elData.style['opacity'];
            if(!fill) fill = 'rgb(0,0,0)';
            const fillRgba = DrawingUtils.colorToRgba(fill, fillOpacity);
            const stroke = this.getStrokeStyle(elData);
            const handle = fillRgba + ';' + stroke;
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
                        const cx = elData.cx ? elData.cx : 0;
                        const cy = elData.cy ? elData.cy : 0;
                        const r = elData.r;
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

                    if(sampleData.style['stroke-rgba'] && sampleData.style['stroke-rgba'] !== 'none') {
                        this.ctx.stroke();
                    }
                }
            }
            return;
        }
        if(mode === 'forcesingle') {
            let fill = elData.style.fill ? elData.style.fill : elData.fill;
            if(!fill) fill = '#000';
            let fillOpacity = elData.style['fill-opacity'] ? elData.style['fill-opacity'] : elData.style['opacity'];

            const cx = elData.cx || 0;
            const cy = elData.cy || 0;

            this.ctx.beginPath();
            this.ctx.fillStyle = DrawingUtils.colorToRgba(fill, fillOpacity);
            this.ctx.strokeStyle = this.getStrokeStyle(elData);
            this.ctx.lineWidth = this.getStrokeWidth(elData);
            this.ctx.arc(cx, cy, elData.r, 0, 2 * Math.PI);
            if(fill !== 'none'){
                this.ctx.fill();
            }

            if(elData.style['stroke-rgba'] && elData.style['stroke-rgba'] !== 'none') {
                this.ctx.stroke();
            }
        }
    }

    private getFillStyle(node: VdomNode, defaultColor = 'none'): string {
        let fill = node.style.fill ? node.style.fill : node.fill;
        let opacity = node.style['fill-opacity'] ? node.style['fill-opacity'] : node.style['opacity'];
        fill = DrawingUtils.colorToRgba(fill, opacity, defaultColor);
        return fill;
    }

    private getStrokeStyle(node: VdomNode): string {
        if(node.style['stroke-rgba']) {
            return node.style['stroke-rgba'];
        }
        let stroke = node.style.stroke ? node.style.stroke : node.stroke;
        if(stroke !== undefined) {
            let strokeOpacity = node.style['stroke-opacity'] === undefined ? node.style['opacity']
                : node.style['stroke-opacity'];
            if(strokeOpacity === undefined) {
                strokeOpacity = node['stroke-opacity'] === undefined ? node['opacity'] : node['stroke-opacity'];
            }

            node.style['stroke-rgba'] = DrawingUtils.colorToRgba(stroke, strokeOpacity);
            return node.style['stroke-rgba'];
        }
        return 'none';
    }

    private getStrokeWidth(node: VdomNode) {
        const width = node.style['stroke-width'] !== undefined ? node.style['stroke-width'] : node['stroke-width'];
        return width === undefined ? undefined : parseFloat(width);
    }

    private rectsByColor = {};

    private drawRect(elData: VdomNode, mode: DrawMode = 'normal') {

        if(mode === 'normal') {
            let fill = elData.style.fill ? elData.style.fill : elData.fill;
            let fillOpacity = elData['fill-opacity'] ? elData['fill-opacity'] : elData['opacity'];
            let fillOpacityStyle = elData.style['fill-opacity'] ? elData.style['fill-opacity'] : elData.style['opacity'];

            if(fillOpacityStyle !== undefined) {
                fillOpacity = fillOpacityStyle;
            }

            //if(!fill) fill = '#000';
            const fillRgba = DrawingUtils.colorToRgba(fill, fillOpacity);
            const stroke = this.getStrokeStyle(elData);
            const handle = fillRgba + ';' + stroke;
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
                        const x = elData.x ? elData.x : 0;
                        const y = elData.y ? elData.y : 0;
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

                    if(sampleData.style['stroke-rgba'] && sampleData.style['stroke-rgba'] !== 'none') {
                        this.ctx.stroke();
                    }
                }
            }
            return;
        }
        if(mode === 'forcesingle') {
            let fill = elData.style.fill ? elData.style.fill : elData.fill;
            if(fill) {
                fill = DrawingUtils.colorToRgba(fill, elData.style['fill-opacity']);
            }

            if(fill && fill !== 'none') {
                this.ctx.fillStyle = elData.style.fill ? elData.style.fill : elData.fill;
                this.ctx.fillRect(elData.x, elData.y, elData.width, elData.height);
            }

            let stroke = elData.style.stroke ? elData.style.stroke : elData.stroke;
            if(stroke !== undefined) {
                stroke = DrawingUtils.colorToRgba(stroke, elData.style['stroke-opacity']);
                this.ctx.strokeStyle = stroke;
                this.ctx.beginPath();
                this.ctx.rect(elData.x, elData.y, elData.width, elData.height);
                this.ctx.stroke();
            }
        }
    }

    private drawTexts: VdomNode[] = [];

    private drawText(node: VdomNode, mode: DrawMode = 'normal') {
        const drawSingle = (elData: VdomNode) => {
            if(elData.text === '') {
                return;
            }
            const fontFamily = 'Times New Roman';
            const fontSize = elData['font-size'] ? DrawingUtils.convertSizeToPx(elData['font-size']) + 'px' : '16px';
            let font = elData.style['font'] ? elData.style['font'] : elData['font'];
            if(!font) {
                font = fontSize + ' ' + fontFamily;
            }
            let align = elData['text-anchor'] !== undefined ? elData['text-anchor'] : elData.style['text-anchor'];
            if(align) {
                if(align === 'middle') {
                    align = 'center';
                }
                this.ctx.textAlign = align;
            }
            let fill = elData['fill'] ? elData['fill'] : elData.style['fill'];
            if(!fill) fill = '#000';
            this.ctx.font = font;
            this.ctx.fillStyle = fill;
            let x = elData.x || 0;
            let y = elData.y || 0;
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
            let x = elData.x || 0;
            let y = elData.y || 0;
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

    private drawPath(elData: VdomNode, mode: DrawMode = 'normal') {
        if(mode !== 'normal' && mode !== 'forcesingle') return;

        const fill = this.getFillStyle(elData, '#000000');
        const stroke = this.getStrokeStyle(elData);
        const strokeWidth = this.getStrokeWidth(elData);

        let p = new Path2D(elData.d);
        this.ctx.fillStyle = fill;
        if(stroke !== undefined && stroke !== 'none') {
            if(strokeWidth !== undefined) {
                this.ctx.lineWidth = strokeWidth;
            }
            this.ctx.strokeStyle = stroke;

            if(elData.style['stroke-linejoin']) {
                const lineJoin = elData.style['stroke-linejoin'];
                if(lineJoin === 'bevel' || lineJoin === 'round' || lineJoin === 'miter') {
                    this.ctx.lineJoin = lineJoin;
                } else {
                    console.error('unknown line join value:', lineJoin)
                }
            }
            this.ctx.stroke(p);
        }

        if(fill && fill !== 'none') {
            this.ctx.fill(p);
        }
    }
    
    private drawTspan(elData: VdomNode, mode: DrawMode = 'normal') {
        if(mode !== 'normal' && mode !== 'forcesingle') return;
        
        this.ctx.font = "10px Arial";
        this.ctx.fillStyle = "#000000";
        const textAlign = <CanvasTextAlign> (elData.style.textAnchor === "middle" ? "center" : elData.style.textAnchor);
        this.ctx.textAlign = textAlign;
        this.ctx.fillText(elData.text, elData.x, elData.y);
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

                        this.ctx.moveTo(elData.x1 || 0, elData.y1 || 0);
                        this.ctx.lineTo(elData.x2 || 0, elData.y2 || 0);

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
            this.ctx.moveTo(elData.x1 || 0, elData.y1 || 0);
            this.ctx.lineTo(elData.x2 || 0, elData.y2 || 0);

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
            if(transform.rotate) {
                //console.log(transform.rotate);
            }
            //console.log(transformString);
            this.ctx.rotate(transform.rotate * Math.PI / 180);
            this.ctx.transform(transform.scaleX, 0, 0, transform.scaleY, transform.translateX, transform.translateY);
            //ctx.rotate(transform.rotate / 2 / Math.PI);

            //console.log(transform.rotate);
            return true;
        }
        return false;
    }
}


let safeLogCount = 0;
function safeLog(...logContents) {
    
    if(safeLogCount < 50) {
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