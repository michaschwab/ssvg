import CanvasForceWorkerMessage from "../util/forceworkermessage";
importScripts("https://d3js.org/d3-collection.v1.min.js");
importScripts("https://d3js.org/d3-dispatch.v1.min.js");
importScripts("https://d3js.org/d3-quadtree.v1.min.js");
importScripts("https://d3js.org/d3-timer.v1.min.js");
importScripts("https://d3js.org/d3-force.v1.min.js");

self.onmessage = function(e: MessageEvent) {
    
    if(e.data) {
        const data = e.data;
        
        if(data.nodes) {
            worker.setNodes(data.nodes);
        }
        if(data.links) {
            worker.setLinks(data.links);
        }
    }
};

class SvgToCanvasForceWorker {
    
    private simulation;
    private nodes;
    private links;
    private sentInitial = false;
    
    constructor() {
        const d3 = (self as any)['d3'];
        this.simulation = d3.forceSimulation()
            .force("link", d3.forceLink().id(function(d) { return d.id; }))
            .force("charge", d3.forceManyBody())
            .force("center", d3.forceCenter(960 / 2, 600 / 2));
        
        this.simulation.on('tick', () => {
            //console.log('tick', arguments);
            const data = {type: "tick", nodes: this.nodes};
            if(!this.sentInitial && this.links) {
                this.sentInitial = true;
                data['links'] = this.links;
                console.log('sending links', this.links);
            }
            postMessage(data);
        })
    }
    
    setNodes(nodes) {
        this.nodes = nodes;
        this.simulation.nodes(this.nodes);
    }
    
    setLinks(links) {
        this.links = links;
        this.simulation.force("link").links(this.links);
    }
}

let worker = new SvgToCanvasForceWorker();