import {VdomManager} from "../util/vdom/vdom-manager";
import CanvasWorker from "./canvasworker";
import DrawingUtils from "./drawingUtils";
if ('importScripts' in self) {
    importScripts("https://stardustjs.github.io/stardust/v0.1.1/stardust.bundle.min.js");
}

export default class Webglrenderer implements CanvasWorker {
    // Stardust Platform
    private platform: any;
    // Lines
    private lines: any;
    private lineData: any[];
    // Circles
    private circles: any;
    private circleData: any[];
    // Rectangles
    private rects: any;
    private rectData: any[];


    constructor(private vdom: VdomManager, private canvas: HTMLCanvasElement, private onDrawn = () => { }) {

        const Stardust = (self as any)['Stardust'];

        Object.defineProperty(this.canvas, 'style', {
            writable: true,
            value: {}
        });

        this.platform = Stardust.platform("webgl-2d", this.canvas, this.vdom.data.width, this.vdom.data.height);

        this.lines = Stardust.mark.create(Stardust.mark.line(), this.platform);
        this.lines
            .attr('p1', d => d.p1)
            .attr('p2', d => d.p2)
            .attr('width', d => d.width)
            .attr('color', d => d.color);

        this.circles = Stardust.mark.create(Stardust.mark.circle(), this.platform);
        this.circles
            .attr('center', d => d.center)
            .attr('radius', d => d.radius)
            .attr('color', d => d.color);

        this.rects = Stardust.mark.create(Stardust.mark.rect(), this.platform);
        this.rects
            .attr('p1', d => d.p1)
            .attr('p2', d => d.p2)
            .attr('color', d => d.color);

        this.draw();

        setTimeout(() => {
            console.log(this.vdom.data);
        }, 1000);
    }

    private lastDrawn: any = null;
    private lastFullSecond = 0;
    private countSinceLastFullSecond = 0;

    draw() {
        this.platform.clear();

        this.lineData = [];
        this.circleData = [];
        this.rectData = [];

        this.drawChildren(this.vdom.data);

        // Render the lines
        this.lines.data(this.lineData);
        this.lines.render();

        // Render the circles
        this.circles.data(this.circleData);
        this.circles.render();

        // Render the rects
        this.rects.data(this.rectData);
        this.rects.render();

        const fullSecond = Math.round(performance.now() / 1000);
        if (fullSecond !== this.lastFullSecond) {
            this.lastFullSecond = fullSecond;
            //console.log(this.countSinceLastFullSecond);
            this.countSinceLastFullSecond = 0;
        }
        this.countSinceLastFullSecond++;

        // console.log('drawn');
        this.onDrawn();
    }

    private rgbaStringToStardustColor(s: string) {
        const rgbaNums = s.substring(4, s.length - 1).split(',').map(num => { return parseFloat(num); });
        rgbaNums[0] /= 255;
        rgbaNums[1] /= 255;
        rgbaNums[2] /= 255;
        return rgbaNums;
    }

    private drawChildren(elData: any) {

        const Stardust = (self as any)['Stardust'];

        if (elData.type && elData.type !== 'g') {
            if (elData.type === 'title') {
                return;
            }
            if (elData.type === 'line') {
                let stroke = elData.style.stroke ? elData.style.stroke : elData.stroke;
                let strokeOpacity = elData.style['stroke-opacity'] ? elData.style['stroke-opacity'] : elData['stroke-opacity'] ? elData['stroke-opacity'] : 1;
                if (!stroke || !stroke.includes('rgb')) {
                    console.log("Error: Only rgb fill is supported for now. Defaulting to black.")
                    stroke = 'rgb(0,0,0,1)';
                }
                const strokeRgba = DrawingUtils.colorToRgba(stroke, strokeOpacity);
                const stardustColor = this.rgbaStringToStardustColor(strokeRgba);
                this.lineData.push({
                    p1: [elData.x1, elData.y1],
                    p2: [elData.x2, elData.y2],
                    width: elData["stroke-width"],
                    color: stardustColor
                });
            } else if (elData.type === 'circle') {
                let fill = elData.style.fill ? elData.style.fill : elData.fill;
                let fillOpacity = elData.style['fill-opacity'] ? elData.style['fill-opacity'] : elData['fill-opacity'] ? elData['fill-opacity'] : 1;
                if (!fill || !fill.includes('rgb')) {
                    console.log("Error: Only rgb fill is supported for now. Defaulting to black.")
                    fill = 'rgb(0,0,0,1)';
                }
                const fillRgba = DrawingUtils.colorToRgba(fill, fillOpacity);
                const stardustColor = this.rgbaStringToStardustColor(fillRgba);
                this.circleData.push({
                    center: [elData.cx, elData.cy],
                    radius: elData.r,
                    color: stardustColor
                });
            } else if (elData.type === 'rect') {
                let fill = elData.style.fill ? elData.style.fill : elData.fill;
                let fillOpacity = elData.style['fill-opacity'] ? elData.style['fill-opacity'] : elData['fill-opacity'] ? elData['fill-opacity'] : 1;
                if (!fill || !fill.includes('rgb')) {
                    console.log("Error: Only rgb fill is supported for now. Defaulting to black.")
                    fill = 'rgb(0,0,0,1)';
                }
                const fillRgba = DrawingUtils.colorToRgba(fill, fillOpacity);
                const stardustColor = this.rgbaStringToStardustColor(fillRgba);

                this.rectData.push({
                    p1: [elData.x, elData.y],
                    p2: [elData.x + elData.width, elData.y + elData.height],
                    color: stardustColor
                });
            } else if (elData.type === 'path') {
                console.log("Path support is still being worked on");
            } else {
                console.log(`${elData.type} is currently unsupported`);
            }
            this.lastDrawn = elData;
        }

        if (elData.children) {
            for (let i = 0; i < elData.children.length; i++) {
                this.drawChildren(elData.children[i]);
            }
        }
    }
}