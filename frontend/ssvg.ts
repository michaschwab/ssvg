import {VdomManager} from '../util/vdom/vdom-manager';
import {CanvasUpdateWorkerMessage, CanvasUpdateData} from '../util/canvas-worker-message';
import {Domhandler, SsvgElement} from './domhandler';
import {CanvasWorker} from '../canvasworker/canvasworker';
import {Canvasrenderer} from '../canvasworker/canvasrenderer';
import CanvasWorkerImporter from '../canvasworker';
import SyncWorkerImporter from '../syncworker';
import {Interactionhandler} from './interactionhandler';
import {Redirector} from './redirector';
import {VdomNode} from '../util/vdom/vdom';

export default class SSVG {
    private worker: Worker;
    private syncWorker: Worker;
    private domHandler: Domhandler;
    private vdom: VdomManager;
    private readonly interactions: Interactionhandler;
    private renderer: CanvasWorker;
    private redirector: Redirector;

    private svg: (SVGElement & SsvgElement) | undefined;
    private readonly canvas: HTMLCanvasElement;
    private svgAssignedAndSizeSet = false;

    private lastCanvasDrawTimes: number[] = [];

    private enterExitQueue: CanvasUpdateData[] = [];

    private readonly safeMode: boolean = false;
    private readonly maxPixelRatio: number | undefined;
    private readonly useWorker: boolean = true;
    private readonly getFps: (fps: number) => void = () => {};

    constructor(options?: {
        safeMode?: boolean;
        maxPixelRatio?: number;
        useWorker?: boolean;
        getFps?: (fps: number) => void;
        svg?: SVGElement & SsvgElement;
    }) {
        if (options) {
            if (options.safeMode !== undefined) {
                this.safeMode = options.safeMode;
            }
            this.maxPixelRatio = options.maxPixelRatio;
            if (options.useWorker !== undefined) {
                this.useWorker = options.useWorker;
            }
            if (options.getFps !== undefined) {
                this.getFps = options.getFps;
            }
        }

        this.canvas = document.createElement('canvas');
        if (!('OffscreenCanvas' in window)) {
            this.useWorker = false;
        }

        if (this.useWorker) {
            this.worker = new CanvasWorkerImporter();
            this.syncWorker = new SyncWorkerImporter();

            this.worker.onmessage = (e) => {
                if (e.data && e.data.msg && e.data.msg === 'DRAWN') {
                    this.logDrawn();
                    //this.updateCanvas();
                }
            };
            const raf = () => {
                this.updateFps();
                this.updateCanvas();
                requestAnimationFrame(raf);
            };
            raf();
        } else {
            const raf = () => {
                this.updateFps();
                this.logDrawn();
                this.updateCanvas();
                requestAnimationFrame(raf);
            };
            raf();
        }

        const svg = options && options.svg ? options.svg : undefined;
        this.setupElementsIfSvgExists(svg);

        this.interactions = new Interactionhandler(
            this.canvas,
            this.svg,
            this.domHandler,
            this.vdom
        );
        this.interactions.setupListeners();

        this.redirector = new Redirector(
            this.svg,
            this.domHandler,
            this.vdom,
            this.interactions,
            this.setCanvasSize.bind(this),
            this.addNode.bind(this),
            this.removeNode.bind(this),
            () => this.svgAssignedAndSizeSet,
            this.setupElementsIfSvgExists.bind(this)
        );

        setTimeout(() => {
            console.log(this.vdom.data);
        }, 1000);
    }

    private setupElementsIfSvgExists(svgEl?: SVGElement & SsvgElement) {
        if (this.svg) {
            return true;
        }

        const svg = !svgEl ? document.getElementsByTagName('svg')[0] : svgEl;

        if (!svg) {
            return false;
        }

        const urlConnector = document.location.href.indexOf('?') === -1 ? '?' : '&';
        const svgSwitchUrl = document.location.href + urlConnector + 'svg';
        const svgSwitchComment = document.createComment(
            ' This project uses SSVG.io to render a SVG as Canvas.\r\n' +
                'To inspect the SVG, please open the following URL:\r\n' +
                svgSwitchUrl +
                '\r\n'
        );

        this.svg = svg as SVGElement & SsvgElement;
        const parent = this.svg.parentElement;

        if (this.svg.nextSibling) {
            const next = this.svg.nextSibling;
            parent.insertBefore(svgSwitchComment, next);
            parent.insertBefore(this.canvas, next);
        } else {
            parent.appendChild(svgSwitchComment);
            parent.appendChild(this.canvas);
        }

        this.domHandler = new Domhandler(this.svg, this.useWorker, this.useWorker);
        this.vdom = this.domHandler.getVDom();

        this.setCanvasSize();

        return true;
    }

    private updateCanvas() {
        if (!this.svgAssignedAndSizeSet) {
            return;
        }

        if (!this.vdom.hasChanges() && !this.domHandler.hasChanges()) {
            return;
        }

        const nodeUpdated = this.useWorker
            ? undefined
            : (node, attr) => this.renderer.nodeUpdated(node, attr);
        this.domHandler.applyStyles();

        this.vdom.transferBufferQueueDataToSynced();
        const queue = this.vdom.getQueue();
        this.vdom.clearQueue();
        this.vdom.updatePropertiesFromQueue(queue, nodeUpdated);

        if (this.useWorker) {
            this.sendUpdateToWorker(queue);
        } else {
            if (this.renderer.updatePropertiesFromQueue) {
                this.renderer.updatePropertiesFromQueue(queue);
            }
            this.renderer.draw();
        }
    }

    private setCanvasSize() {
        if (!this.svg || !this.vdom.data.width || !this.vdom.data.height) {
            return;
        }
        this.vdom.data.scale = window.devicePixelRatio;
        if (this.maxPixelRatio !== undefined && this.vdom.data.scale > this.maxPixelRatio) {
            this.vdom.data.scale = this.maxPixelRatio;
        }

        this.canvas.style.width = this.vdom.data.width + 'px';
        this.canvas.style.height = this.vdom.data.height + 'px';
        this.canvas.width = this.vdom.data.width * this.vdom.data.scale;
        this.canvas.height = this.vdom.data.height * this.vdom.data.scale;

        if (this.useWorker) {
            const offscreen = (this.canvas as any).transferControlToOffscreen();
            const channel = new MessageChannel();
            this.worker.postMessage(
                {
                    cmd: 'INIT',
                    data: {
                        canvas: offscreen,
                        visData: this.vdom.data,
                        safeMode: this.safeMode,
                        port: channel.port2,
                    },
                },
                [offscreen, channel.port2]
            );
            this.syncWorker.postMessage(
                {
                    cmd: 'INIT',
                    data: {
                        visData: this.vdom.data,
                        safeMode: this.safeMode,
                        port: channel.port1,
                    },
                },
                [channel.port1]
            );

            this.vdom.ensureNodesMapped();
        } else {
            this.renderer = new Canvasrenderer(this.vdom, this.canvas, this.safeMode, () => {});
        }

        this.svgAssignedAndSizeSet = true;
    }

    addNode(node: VdomNode, parentNode: VdomNode, keepChildren: boolean) {
        if (this.useWorker) {
            this.enterExitQueue.push({
                cmd: 'ENTER',
                node: node,
                parentGlobalIndex: parentNode.globalElementIndex,
                keepChildren: keepChildren,
            });
        } else {
            if (this.renderer.addNode) {
                this.renderer.addNode(node);
            }
        }
    }

    removeNode(node: VdomNode, parentNode: VdomNode) {
        this.enterExitQueue.push({
            cmd: 'EXIT',
            childGlobalIndex: node.globalElementIndex,
            parentGlobalIndex: parentNode.globalElementIndex,
        });
    }

    private logDrawn() {
        this.lastCanvasDrawTimes.push(Date.now());

        if (this.lastCanvasDrawTimes.length > 20) {
            this.lastCanvasDrawTimes.shift(); // Remove first item
        }
    }

    private updateFps() {
        if (this.lastCanvasDrawTimes.length) {
            const timeForTenDrawsMs = Date.now() - this.lastCanvasDrawTimes[0];
            const fps = Math.round((this.lastCanvasDrawTimes.length / timeForTenDrawsMs) * 1000);
            this.getFps(fps);
        }
    }

    private sendUpdateToWorker(queue) {
        const msg: CanvasUpdateWorkerMessage = {
            cmd: 'UPDATE_NODES',
            data: {
                enterExit: this.enterExitQueue,
                update: queue,
            },
        };

        this.syncWorker.postMessage(msg);
        //this.worker.postMessage(msg);
        this.enterExitQueue = [];
    }
}
