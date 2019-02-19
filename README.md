# SSVG: Scalable Scalable Vector Graphics
Library to speed up interactive svg-based data visualizations by transforming them into canvases.

# Installation

You need to have npm, webpack and webpack-cli installed (`npm i --global webpack webpack-cli`).

1. Clone the repo
2. `npm i`
3. `webpack`
4. `npm link`
5. cd into your visualization directory
6. `npm link ssvg`
7. After loading d3.js, add:
```
<script src="./node_modules/ssvg/dist/ssvg.js"></script>
<script>
  if(window.location.hash) {
    new SSVG();
  }
</script>
```

# Update

`git pull && webpack`