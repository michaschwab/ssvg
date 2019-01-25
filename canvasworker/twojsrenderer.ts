import VDom from "../util/vdom";
import SvgToCanvasWorker from "./canvasworker";
//importScripts("https://stardustjs.github.io/stardust/v0.1.1/stardust.bundle.min.js");
//importScripts("https://raw.github.com/jonobr1/two.js/master/build/two.min.js");
/*Object.defineProperty(window, 'window', {
    value: self,
    configurable: false,
    enumerable: true,
    writable: false
});*/
importScripts("http://localhost:8080/node_modules/svg2canvas/two.js");
//import Two from './two.js';

export default class Twojsrenderer implements SvgToCanvasWorker {
    private two: any;
    private circles;
    private circleData;
    private lines;
    private linesData;
    
    constructor(private vdom: VDom, private canvas: HTMLCanvasElement) {
        
        const Two = (self as any)['Two'];
        
        Object.defineProperty(this.canvas, 'style', {
            writable: true,
            value: {}
        });
        this.two = new Two({
            width: vdom.data.width,
            height: vdom.data.height,
            type: 'WebGLRenderer',
            domElement: canvas
        });
        //console.log(this.canvas.style);
        //this.platform = Stardust.platform("webgl-2d", this.canvas, this.vdom.data.width, this.vdom.data.height);
        
        /*const circleSpec = Stardust.mark.circle(8);
        this.circles = Stardust.mark.create(circleSpec, this.platform);
        this.circles
            .attr('center', d => [d.cx, d.cy])
            .attr('radius', d => d.r)
            .attr('color', d => d.style.fill ? d.style.fill : d.fill);*/
        
        /*this.lines = Stardust.mark.create(Stardust.mark.line(), this.platform);
        this.lines
            .attr('width', 1)
            //.attr('color', d => d.style.stroke ? d.style.stroke : d.stroke)
            .attr('color', [0,0,0,1])
            .attr('p1', d => [d.x1, d.y1])
            .attr('p2', d => [d.x2, d.y2]);*/
        
        this.draw();
        
        setTimeout(() => {
            console.log(this.vdom.data);
        }, 1000);
    }
    
    private lastDrawn: any = null;
    private lastFullSecond = 0;
    private countSinceLastFullSecond = 0;
    
    draw() {
        //this.platform.clear();
        this.circleData = [];
        this.linesData = [];
        this.drawChildren(this.vdom.data);
        
        this.two.update();
        
        const fullSecond = Math.round(performance.now() / 1000);
        if(fullSecond !== this.lastFullSecond) {
            this.lastFullSecond = fullSecond;
            console.log(this.countSinceLastFullSecond);
            this.countSinceLastFullSecond = 0;
        }
        this.countSinceLastFullSecond++;
        //console.log('drawn');
        postMessage({msg: 'DRAWN'});
    }
    
    private drawChildren(elData: any) {
        
        const Stardust = (self as any)['Stardust'];
        
        //if(elData.type !== 'line')
        {
            //this.applyTransform(elData.transform);
        }
        
        if(elData.type && elData.type !== 'g') {
            let fill = elData.style.fill ? elData.style.fill : elData.fill;
            let stroke = elData.style.stroke ? elData.style.stroke : elData.stroke;
            let strokeWidth = elData.style['stroke-width'] ? elData.style['stroke-width'] : elData['stroke-width'];
    
            if(elData.type === 'title') {
                return;
            }
            
            if(elData.type === 'circle') {
    
                const circle = this.two.makeCircle(elData.cx, elData.cy, elData.r);
                circle.fill = fill;
                circle.stroke = stroke;
                circle.lineWidth = strokeWidth;
                
            } else if(elData.type === 'line') {
                this.linesData.push(elData);
                /*ctx.moveTo(elData.x1, elData.y1);
                ctx.lineTo(elData.x2, elData.y2);*/
            } else if(elData.type === 'path') {
                /*let p = new Path2D(elData.d);
                //ctx.stroke(p);
                ctx.fillStyle = fill;
                //console.log(elData);
                //ctx.fill(p);
                if(stroke !== 'none') {
                    ctx.lineWidth = strokeWidth;
                    ctx.strokeStyle = strokeWidth + ' ' + stroke;
                    ctx.stroke(p);
                }*/
            } else if(elData.type === 'tspan') {
                /*ctx.font = "10px Arial";
                ctx.fillStyle = "#000000";
                ctx.textAlign = elData.style.textAnchor === "middle" ? "center" : elData.style.textAnchor;
                ctx.fillText(elData.text, elData.x, elData.y);*/
            }
            this.lastDrawn = elData;
        }
        
        if(elData.children) {
            for(let i = 0; i < elData.children.length; i++) {
                this.drawChildren(elData.children[i]);
            }
        }
        if(elData.type !== 'line') {
            //console.log(elData.type);
            //ctx.restore();
        }
    }
}