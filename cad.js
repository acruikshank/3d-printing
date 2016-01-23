window.a3d = window.a3d || {};
a3d.cad = (function() {
  var camera, scene, renderer;
  var ground;
  var meshes = {};

  function init() {
    renderer = new THREE.WebGLRenderer();
    renderer.setSize( window.innerWidth, window.innerHeight );
    renderer.shadowMapEnabled = true;
    document.body.appendChild( renderer.domElement );

    camera = new THREE.PerspectiveCamera( 70, window.innerWidth / window.innerHeight, 1, 5000 );
    camera.position.z = 100;

    // controls = new THREE.OrbitControls( camera );
    // controls.addEventListener( 'change', function() {renderer.render( scene, camera );} );
    CameraControls( renderer.domElement, camera );

    scene = new THREE.Scene();

    scene.fog = new THREE.Fog( 0xffffff, 1, 10000 );
    scene.fog.color.setHSL( 0.6, 0, .2 );

    var light = new THREE.DirectionalLight(0xbbbbbb);
    light.position.set(100,-100,250);
    light.rotation.x = light.rotation.y = light.rotation.z = 0;
    light.target.position.set(0.0,0.0,0.0);
    light.target.updateMatrixWorld();
    light.castShadow = true;
    light.shadowMapWidth = 4096;
    light.shadowMapHeight = 4096;

    var d = 200;
    light.shadowCameraLeft = -d;
    light.shadowCameraRight = d;
    light.shadowCameraTop = d;
    light.shadowCameraBottom = -d;

    scene.add(light);

    var hemiLight = new THREE.HemisphereLight( 0xffffff, 0xffffff, 0.6 );
    hemiLight.color.setHSL( 0.095, 0, 1 );
    hemiLight.groundColor.setHSL( 0.095, .05, 0.8 );
    hemiLight.position.set( 0, 500, 0 );
    scene.add( hemiLight );


    // var directionalLight = new THREE.DirectionalLight( /*Math.random() * */ 0xffffff, 0.125 );

    // directionalLight.position.x = Math.random() - 0.5;
    // directionalLight.position.y = Math.random() - 0.5;
    // directionalLight.position.z = Math.random() - 0.5;

    // directionalLight.position.normalize();
    // directionalLight.castShadow = true;

    // scene.add( directionalLight );

    // GROUND
    var groundGeo = new THREE.PlaneGeometry( 10000, 10000 );
    var groundMat = new THREE.MeshPhongMaterial( { ambient: 0x050505, color: 0x050505, specular: 0x050505 } );
    groundMat.color.setHSL( 0.095, .05, 0.8 );

    ground = new THREE.Mesh( groundGeo, groundMat );
    scene.add( ground );

    ground.receiveShadow = true;

    renderer.gammaInput = true;
    renderer.gammaOutput = true;

    renderer.shadowMapEnabled = true;
    renderer.shadowMapSoft = true;
    renderer.shadowMapCullFace = THREE.CullFaceBack;

    renderer.render( scene, camera );


    window.addEventListener( 'resize', onWindowResize, false );
  }

  function CameraControls( canvas, camera ) {
    var lastMouse;

    canvas.onmousedown = function(evt) {
      lastMouse = {x:evt.clientX, y:evt.clientY};
    }
    canvas.onmousemove = function(evt) {
      if (! lastMouse) return;

      var w = renderer.domElement.offsetWidth, h = renderer.domElement.offsetHeight;
      var dx = (evt.clientX - lastMouse.x);
      var dy = (evt.clientY - lastMouse.y);
      var dist = Math.sqrt(dx*dx + dy*dy);

      if (evt.shiftKey) {
        camera.translateOnAxis(new THREE.Vector3(-dx/dist,dy/dist,0), 200 * dist / h);
      } else if (evt.altKey) {
        camera.rotateOnAxis(new THREE.Vector3(0,0,1), Math.atan2(evt.clientY-h/2,evt.clientX-w/2) - Math.atan2(lastMouse.y-h/2,lastMouse.x-w/2) );
      } else {
        camera.rotateOnAxis(new THREE.Vector3(-dy/dist,dx/dist,0), Math.PI * dist / h);
      }
      lastMouse = {x:evt.clientX, y:evt.clientY};
      camera.updateProjectionMatrix();
      render();
      persistOrientation();
    }
    canvas.onmouseup = function(evt) {
      lastMouse = null;
    }
    canvas.onmousewheel = function(evt) {
      evt.preventDefault();
      camera.translateOnAxis(new THREE.Vector3(0,0,1), -.1 * evt.wheelDelta);
      camera.updateProjectionMatrix();
      render();
      persistOrientation();
    }
    function persistOrientation() {
      localStorage.cameraPosition = JSON.stringify({x:camera.position.x, y:camera.position.y, z:camera.position.z});
      localStorage.cameraRotation = JSON.stringify({x:camera.quaternion.x, y:camera.quaternion.y, z:camera.quaternion.z, w:camera.quaternion.w});
    }

    if (localStorage.cameraPosition) {
      try {
        var pos = JSON.parse(localStorage.cameraPosition);
        camera.position = new THREE.Vector3(pos.x,pos.y,pos.z);
        var rot = JSON.parse(localStorage.cameraRotation);
        camera.quaternion = new THREE.Quaternion(rot.x,rot.y,rot.z,rot.w);
      } catch (e) { /* ignore */ }
    }
  }

  function render() {
    renderer.render( scene, camera );
  }

  function onWindowResize() {

    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize( window.innerWidth, window.innerHeight );
  }


  function saveSTL( geometry, name ){
    var stlString = generateSTL( geometry );

    var blob = new Blob([stlString], {type: 'text/plain'});

    saveAs(blob, name+'.stl');
  }

  function stringifyVector(vec){
    return ""+vec.x+" "+vec.y+" "+vec.z;
  }

  function stringifyVertex(vec){
    return "vertex "+stringifyVector(vec)+" \n";
  }

  function generateSTL(geometry){
    var vertices = geometry.vertices;
    var tris     = geometry.faces;

    var stl = "solid pixel\n";
    for(var i = 0; i<tris.length; i++){
      stl += ("facet normal "+stringifyVector( tris[i].normal )+" \n");
      stl += ("outer loop \n");
      stl += stringifyVertex( vertices[ tris[i].a ] );
      stl += stringifyVertex( vertices[ tris[i].b ] );
      stl += stringifyVertex( vertices[ tris[i].c ] );
      stl += ("endloop \n");
      stl += ("endfacet \n");
    }
    stl += ("endsolid");

    return stl
  }

  function saveSTLtoLocalStorage( geometry, name ){
    newFile( name+'.stl', 5*1024*1024*1024, function(file) {
      return writeSTLAsync(stlWriter, geometry, function() {
        file.createWriter(function(writer) { console.log("WROTE " + writer.length + " BYTES", file); });
      });

      function stlWriter(content, next) {
        file.createWriter(function(writer) {
          writer.onwriteend = next;
          writer.seek(writer.length);
          writer.write(new Blob([content], {type: "text/plain"}));
        });
      }
    })
  }

  function writeSTLAsync(writer, geometry, done) {
    var vertices = geometry.vertices;
    var tris     = geometry.faces;

    var i = 0;
    var iStart = 0;
    var stl = "solid pixel\n";
    (function writeAllFaces() {
      for(; i<tris.length; i++){
        stl += ("facet normal "+stringifyVector( tris[i].normal )+" \n");
        stl += ("outer loop \n");
        stl += stringifyVertex( vertices[ tris[i].a ] );
        stl += stringifyVertex( vertices[ tris[i].b ] );
        stl += stringifyVertex( vertices[ tris[i].c ] );
        stl += ("endloop \n");
        stl += ("endfacet \n");
        if (i > iStart && i % 1000 == 0) {
          writer(stl, writeAllFaces);
          stl = '';
          iStart = i;
          return;
        }
      }
      stl += "endsolid";
      writer(stl, done);
    })()
  }

  function newFile( name, quota, cb ) {
    navigator.webkitPersistentStorage.requestQuota(quota, function() {
      window.webkitRequestFileSystem(window.PERSISTENT , quota, prepareFile(name, cb));
    });

    function prepareFile(name, next) {
      return function(localStorage) {
        removeFile( localStorage, name, function() {
          localStorage.root.getFile(name, {create: true}, next);
        });
      }
    }

    function removeFile(localStorage, name, next) {
      localStorage.root.getFile(name, {create: true}, function(file) { file.remove(next) });
    }
  }

  function addSaveButton( meshName, largeFile ) {
    var btn = document.createElement('button');
    btn.setAttribute('data-mesh', meshName);
    btn.innerHTML = 'save ' + meshName;
    document.getElementById('buttons').appendChild(btn);
    if (largeFile)
      btn.addEventListener('click', function() { saveSTLtoLocalStorage(meshes[meshName].geometry, meshName); });
    else
      btn.addEventListener('click', function() { saveSTL(meshes[meshName].geometry, meshName); });
  }

  function addMesh( mesh, meshName, opts ) {
    if (opts === true)
      opts = {clean:true};
    else
      opts = opts || {};

    if (! opts.noShadow) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }

    scene.add(mesh);

    if (! mesh.geometry.boundingBox)
      mesh.geometry.computeBoundingBox();
    var bounds = mesh.geometry.boundingBox.clone();
    var size = bounds.max.sub(bounds.min);
    var center = bounds.min.clone().add( size.multiplyScalar(.5) );

    if ( ! opts.clean ) {
      var outlineMesh = new THREE.Mesh( mesh.geometry, new THREE.MeshBasicMaterial( { color: 0x000000, side: THREE.BackSide } ));

      var scale = new THREE.Vector3(1,1,1).divide(size).multiplyScalar(opts.edge || .5).addScalar(1);


      var transform = new THREE.Matrix4()
        .multiply(new THREE.Matrix4().setPosition(center))
        .multiply(new THREE.Matrix4().scale(scale))
        .multiply(new THREE.Matrix4().setPosition(center.multiplyScalar(-1)))

      outlineMesh.applyMatrix(transform);

      scene.add(outlineMesh);
    }

    ground.position.z = Math.min(ground.position.z, bounds.min.z);

    if (meshName) {
      meshes[meshName] = mesh;
      addSaveButton( meshName, opts.large );
    }
  }

  function updateMesh(mesh, meshName) {
    scene.remove(mesh);
    scene.add(mesh);
  }

  function setCamera(x,y,z, atX, atY, atZ) {
    camera.position.x = x;
    camera.position.y = y;
    camera.position.z = z;
    camera.lookAt( new THREE.Vector3(atX,atY,atZ) );
  }

  return {init:init, render:render, addMesh:addMesh, updateMesh:updateMesh, setCamera:setCamera}
})();