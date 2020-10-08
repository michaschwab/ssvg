import {CanvasWorker} from './canvasworker';
import {VdomManager} from '../util/vdom/vdom-manager';
import {SetPropertyQueueData} from '../util/vdom/set-property-queue-data';
//importScripts("https://stardustjs.github.io/stardust/v0.1.1/stardust.bundle.min.js");
//importScripts("https://raw.github.com/jonobr1/two.js/master/build/two.min.js");
/*Object.defineProperty(window, 'window', {
    value: self,
    configurable: false,
    enumerable: true,
    writable: false
});*/
if ('importScripts' in self) {
    importScripts('http://localhost:8080/node_modules/ssvg/two.js');
}

export default class Twojsrenderer implements CanvasWorker {
    private two: any;
    private circles;
    private circleData;
    private lines;
    private linesData;

    constructor(
        private vdom: VdomManager,
        private canvas: HTMLCanvasElement,
        private offscreenCanvas: HTMLCanvasElement,
        private onDrawn = () => {}
    ) {
        const Two = (self as any)['Two'];

        Object.defineProperty(this.canvas, 'style', {
            writable: true,
            value: {},
        });
        this.two = new Two({
            width: vdom.data.width,
            height: vdom.data.height,
            type: Two.Types.canvas,
            domElement: canvas,
        });

        this.draw();

        setTimeout(() => {
            console.log(this.vdom.data);
        }, 1000);
    }

    private lastDrawn: any = null;
    private lastFullSecond = 0;
    private countSinceLastFullSecond = 0;

    addNode(node) {
        if (node.type === 'circle') {
            node.twojsNode = this.two.makeCircle(50, 50, 5);
        } else if (node.type === 'line') {
            node.twojsNode = this.two.makeLine(10, 10, 20, 20);
        }
    }

    updatePropertiesFromQueue(setAttrQueue: SetPropertyQueueData) {
        // Needs updating
        /*for (let parentSelector in setAttrQueue) {
            const parentNode = this.vdom.getParentNodeFromSelector(parentSelector);

            for (let attrName in setAttrQueue[parentSelector]) {
                //const attrNameStart = attrName.substr(0, 'style;'.length);
                for (let childIndex in setAttrQueue[parentSelector][attrName]) {
                    const childNode = parentNode.children[childIndex];
                    //console.log(childNode);
                    const value = setAttrQueue[parentSelector][attrName][childIndex];
                    const twojsNode = childNode.twojsNode;

                    if (childNode.type === 'circle' && childNode.twojsNode) {
                        if (attrName === 'fill') {
                            twojsNode.fill = value; //'#FF8000';
                            //safeLog('setting circle fill');
                        } else if (attrName === 'stroke' || attrName === 'style;stroke') {
                            twojsNode.stroke = value;
                            //safeLog('setting circle stroke to ', value);
                        } else if (attrName === 'r') {
                            twojsNode.r = value;
                        } else if (attrName === 'cx') {
                            twojsNode.translation.x = value;
                            //twojsNode.x = typeof value === 'string' ? parseInt(value) : Math.round(value);
                        } else if (attrName === 'cy') {
                            twojsNode.translation.y = value;
                            //twojsNode.y = value;
                        } else {
                            //childNode.twojsNode[attrName] = value;
                        }
                    } else if (childNode.type === 'line' && childNode.twojsNode) {
                        if (attrName === 'x1') {
                            twojsNode.vertices[0].x = value;
                        } else if (attrName === 'y1') {
                            twojsNode.vertices[0].y = value;
                        } else if (attrName === 'x2') {
                            twojsNode.vertices[1].x = value;
                        } else if (attrName === 'y2') {
                            twojsNode.vertices[1].y = value;
                        } else if (attrName === 'stroke' || attrName === 'style;stroke') {
                            twojsNode.stroke = value;
                            //console.count('setting line stroke');
                        }
                    }
                }
            }
        }*/
    }

    draw() {
        //this.platform.clear();
        this.circleData = [];
        this.linesData = [];

        this.two.update();

        const fullSecond = Math.round(performance.now() / 1000);
        if (fullSecond !== this.lastFullSecond) {
            this.lastFullSecond = fullSecond;
            //console.log(this.countSinceLastFullSecond);
            this.countSinceLastFullSecond = 0;
            //console.log(this.two);
        }
        this.countSinceLastFullSecond++;
        //console.log('drawn');
        this.onDrawn();
    }
}

let safeLogCount = 0;
function safeLog(...logContents) {
    if (safeLogCount < 50) {
        safeLogCount++;
        console.log(...logContents);
    }
}
function safeErrorLog(...logContents) {
    if (safeLogCount < 50) {
        safeLogCount++;
        console.error(...logContents);
    }
}
