import CanvasForceWorkerMessage from "../util/forceworkermessage";

export default class Forcefrontend {

    private worker: Worker = new Worker('dist/forceworker.js');
    private onTick: () => void;
    
    private nodes;
    private links;
    
    private nodesById: {[id: string]: any} = {};
    
    constructor() {
        if((window as any)['d3']) {
            this.replaceD3ForceSimulation();
            this.replaceD3Drag();
            this.replaceD3Attr();
            this.setupWorkerCommunication()
        }
    }

    replaceD3ForceSimulation() {
        const d3 = (window as any)['d3'];

        d3.forceSimulation = () => {
            const sim = {
                force: () => { return sim; },
                nodes: (nodes) => { this.setNodes(nodes); return sim; },
                alphaTarget: () => { return sim; },
                restart: () => { return sim; },
                on: (name: string, callback: () => void) => {
                    if(name === 'tick') {
                        this.onTick = callback;
                    } else {
                        console.log(name);
                    }

                    return sim;
                },
                links: (links) => { this.setLinks(links); return sim; },
            };
            return sim;
        };
    }

    replaceD3Drag() {
        const d3 = (window as any)['d3'];
        const origDrag = d3.drag;

        d3.drag = () => {
            let d3Drag;
            let callbacks = {'start': () => {}, 'drag': () => {}, 'end': () => {}};
            const dragWrapper = () => {
                console.log(arguments);
                d3Drag = origDrag();
                d3Drag.on('start', onDrag('start'));
                d3Drag.on('drag', onDrag('drag'));
                d3Drag.on('end', onDrag('end'));
            };
            dragWrapper.on = (name: string, callback: () => void) => {
                callbacks[name] = callback;
                return dragWrapper;
            };
            const onDrag = (eventName) => {
                return d => {
                    const nodeMock = {x: 0, y: 0, fx: 0, fy: 0};
                    callbacks[eventName](nodeMock);
                    console.log(nodeMock);
                    console.log(d);
                };
            };


            return dragWrapper;
        };
    }

    replaceD3Attr() {
        /*if((window as any)['d3']) {
            const d3 = (window as any)['d3'];
            const me = this;

            let origSelectionAttr = d3.selection.prototype.attr;
            d3.selection.prototype.attr = function(name, value) {
                if((name === 'cx' || name === 'cy') && value) {
                    me.setNodePositions(this, name, value);
                }

                return origSelectionAttr.apply(this, arguments);
            };
        }*/
    }
/*
    private nodeAttrQueue: {x: number[], y: number[]} = {x: [], y: []};

    setNodePositions(selection, attrName, value) {
        const els = selection._groups[0];
        attrName = attrName.substr(1); // Turn cx and cy into x and y.

        for(let i = 0; i < els.length; i++) {
            const svgEl = els[i];

            this.nodeAttrQueue[attrName][i] =
                typeof value === "function" ? value(svgEl.__data__) : value;
        }
    }*/
    
    private setupWorkerCommunication() {
        this.worker.onmessage = (event) => {
            switch (event.data.type) {
                case "tick":
                
                    const nodes = event.data.nodes;

                    if(!nodes) {
                        return;
                    }
                
                    for(let i = 0; i < nodes.length; i++) {
                        for(let key in nodes[i]) {
                            this.nodes[i][key] = nodes[i][key];
                        }
                    }
                    
                    if(event.data.links) {
                        const links = event.data.links;
                        
                        for(let i = 0; i < links.length; i++) {
                            for(let key in links[i]) {
                                this.links[i][key] = links[i][key];
                            }
                        }
                    }
                    else
                    {
                        for(let i = 0; i < this.links.length; i++) {
                            try {
                                if(typeof this.links[i].source === 'object') {
                                    this.links[i].source.x = this.nodesById[this.links[i].source.id].x;
                                    this.links[i].source.y = this.nodesById[this.links[i].source.id].y;
                                    this.links[i].target.x = this.nodesById[this.links[i].target.id].x;
                                    this.links[i].target.y = this.nodesById[this.links[i].target.id].y;
                                }
                            } catch(e) {
                                safeErrorLog(e);
                                safeErrorLog(this.links[i].source);
                            }
                        }
                    }

                    return this.onTick();
            }
        };
    }
    
    private setNodes(nodes) {
        this.nodes = nodes;
        for(let node of nodes) {
            this.nodesById[node.id] = node;
        }
        this.worker.postMessage({ nodes: nodes });
    }
    
    private setLinks(links) {
        this.links = links;
        this.worker.postMessage({ links: links });
    }
    
    private sendToWorker(msg: CanvasForceWorkerMessage, data?: any) {
        this.worker.postMessage(msg, data);
        //console.log(roughSizeOfObject(msg));
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