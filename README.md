# SSVG: Scalable Scalable Vector Graphics
Library to speed up interactive svg-based data visualizations by transforming them into canvases.

# Simple Usage
Just add this after loading d3:
```
<script src="https://ssvg.surge.sh/ssvg-auto.js"></script>
```

If you want to toggle SSVG on and off using a hash, use this:
```
<script src="https://ssvg.surge.sh/ssvg-auto.js"></script>
<script>
  if(window.location.hash) {
    new SSVG();
  }
</script>
```

# Dev Installation

You need to have npm, webpack and webpack-cli installed (`npm i --global webpack webpack-cli`).

1. Clone the repo
2. Install the dependencies: `npm i`
3. Transpile and bundle the code: `webpack`
4. Make SSVG usable as package in other projects: `npm link`
5. cd into your visualization directory
6. Locally "install" SSVG: `npm link ssvg`. This should add an ssvg directory to your node_modules folder.
If this fails, you may not have npm set up in your project folder. You can init a new npm package with `npm init`, 
after which running the npm link command as above should install ssvg correctly.
7. After loading d3.js, you should add the library. If you just want to enable it by default, use:
```
<script src="./node_modules/ssvg/dist/ssvg-auto.js"></script>
```
Otherwise, if you want to toggle SSVG on and off based on whether you are using a hash, you could use the manual
version like so:
```
<script src="./node_modules/ssvg/dist/ssvg.js"></script>
<script>
  if(window.location.hash) {
    new SSVG();
  }
</script>
```

# Dev Update

`git pull && webpack`