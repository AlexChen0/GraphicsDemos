//3456789_123456789_123456789_123456789_123456789_123456789_123456789_123456789
// (JT: why the numbers? counts columns, helps me keep 80-char-wide listings,
//  lets me see EXACTLY what the editor's 'line-wrap' feature will do.)

//===  JT_tracer0-Scene.js  ===================================================
// The object prototypes here and in related files (and their comments):
//      JT_tracer1-Camera.js
//      JT_tracer2-Geom.js
//      JT_tracer3-ImgBuf.js
// are suitable for any and all features described in the Ray-Tracing Project 
// Assignment Sheet for EECS 351-2 Intermediate Computer Graphics.
//
// HOWEVER, they're not required, nor even particularly good:
//				(notably awkward style from their obvious C/C++ origins) 
// They're here to help you get 'started' on better code of your own,
// and to help you avoid common structural 'traps' in writing ray-tracers
//		that might otherwise force ugly/messy refactoring later, such as:
//  --lack of a well-polished vector/matrix library; e.g. open-src glmatrix.js
//  --lack of floating-point RGB values to compute light transport accurately,
//	--no distinct 'camera' and 'image' objects or 'trace' and 'display' funcs to 
// 		separate slow ray-tracing steps from fast screen-display and refresh.
//	--lack of ray-trace image-buffer (window re-size would discard your work!) 
//  --lack of texture-mapped image display; permits ray-traced image of any 
//		resolution to display on any screen at any desired image size
//	--ability to easily match OpenGL/WebGL functions with ray-tracing results, 
//		using identically-matching ray-tracing functions for cameras, views, 
//		transformations, lighting, and materials (e.g. rayFrustum(), rayLookAt(); 
//		rayTranlate(), rayRotate(), rayScale()...)
//  --a straightforward method to implement scene graphs & jointed objects. 
//		Do it by transforming world-space rays to model coordinates, rather than 
//		models to world coords, using a 4x4 worl2model matrix stored in each 
//		model (each CGeom primitive).  Set it by OpenGL-like functions 
//		rayTranslate(), rayRotate(), rayScale(), etc.
//  --the need to describe geometry/shape independently from surface materials,
//		and to select material(s) for each shape from a list of materials;
//  --materials that permit procedural 3D textures, turbulence & Perlin Noise,  
//	--objects for independent light sources, ones that can inherit their 
//    location(s) from a geometric shape (e.g. a light-bulb shape).
//  --need to create a sortable LIST of ray/object hit-points, and not just
//		the intersection nearest to the eyepoint, to enable shape-creation by
//		Constructive Solid Geometry (CSG), alpha-blending, & ray root-finding.
//  --functions organized well to permit easy recursive ray-tracing:  don't 
//		tangle together ray/object intersection-finding tasks with shading, 
//		lighting, and materials-describing tasks.(e.g. traceRay(), findShade() )

/*
-----------ORGANIZATION:-----------
I recommend using just one or two global top-level objects (put above main() )
  g_myPic == new CImgBuf(512,512);  // your 'image buffer' object to hold 
                                    // a floating-point ray-traced image, and
	g_myScene = new CScene();         // your ray-tracer, which can fill any
	                                  // CImgBuf 'image buffer' you give to it.
	g_myScene.setImgBuf(g_myPic);     // Sets ray-tracers destination. 
	g_myScene.initScene(num);         // Sets up selected 3D scene for ray-tracer;
	                                  // Ready to trace!
		
One CScene object contains all parts of our ray-tracer: 
  its camera (CCamera) object, 
  its collection of 3D shapes (CGeom), 
  its collection of light sources (CLight), 
  its collection of materials (CMatl), and more.  
When users press the 'T' or 't' key (see GUIbox method gui.keyPress() ), 
  the program starts ray-tracing:
  -- it calls the CScene method 'MakeRayTracedImage()'. This top-level function 
  fills each pixel of the CImgBuf object (e.g. g_myPic) that was set as its
  'destination' by calling the CScene.setImgBuf() function.
  This 'makeRayRacedImage() function orchestrates creation and recursive tracing 
  of millions of rays to find the on-screen color of each pixel in the CImgBuf
  object set as its destination (g_myPic).
  The CScene object also contains & uses:
		--CRay	== a 3D ray object in an unspecified coord. system (usually 'world').
		--CCamera == ray-tracing camera object defined the 'world' coordinate system.
		--CGeom	== a 3D geometric shape object for ray-tracing (implicit function).
		  The 'item[]' array holds all CGeom objects for a scene.
		--CHit == an object that describes how 1 ray pierced the surface of 1 shape; 
		--CHitList == an object that holds an array of all CHit objects found for
		   1 ray traced thru entire CScene. (Later ray-tracer versions have multiple
		   CHitList objects due to recursive ray-tracing.  One CHitList object for 
		   the eyeRay; another for rays recursively-traced from eye-ray hit-points,
		   such as rays for showShadow, reflection, transparency, etc.)
*/

//----------------------------------------------------------------------------
// NOTE: JavaScript has no 'class-defining' statements or declarations: instead
// we simply create a new object type by defining its constructor function, and
// add member methods/functions using JavaScript's 'prototype' feature.
// SEE: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/prototype 
//----------------------------------------------------------------------------

var g_t0_MAX = 1.23E12;  // 'sky' distance; approx. farthest-possible hit-point.

function CHit() {
//=============================================================================
// Describes one ray/object intersection point that was found by 'tracing' one
// ray through one shape (through a single CGeom object, held in the
// CScene.item[] array).
// CAREFUL! We don't use isolated CHit objects, but instead gather all the CHit
// objects for one ray in one list held inside a CHitList object.
// (CHit, CHitList classes are consistent with the 'HitInfo' and 'Intersection'
// classes described in FS Hill, pg 746).

    this.hitGeom = null;        // (reference to)the CGeom object we pierced in
                                //  in the CScene.item[] array (null if 'none').
                                // NOTE: CGeom objects describe their own
                                // materials and coloring (e.g. CMatl).
// TEMPORARY: replaces traceGrid(),traceDisk() return value
this.hitNum = -1; // SKY color

    this.t0 = g_t0_MAX;         // 'hit time' parameter for the ray; defines one
                                // 'hit-point' along ray:   orig + t*dir = hitPt.
                                // (default: t set to hit very-distant-sky)
    this.hitPt = vec4.create(); // World-space location where the ray pierced
                                // the surface of a CGeom item.
    this.surfNorm = vec4.create();  // World-space surface-normal vector at the 
                                //  point: perpendicular to surface.
    this.viewN = vec4.create(); // Unit-length vector from hitPt back towards
                                // the origin of the ray we traced.  (VERY
                                // useful for Phong lighting, etc.)
    this.isEntering=true;       // true iff ray origin was OUTSIDE the hitGeom.
                                //(example; transparency rays begin INSIDE).
                                
    this.modelHitPt = vec4.create(); // the 'hit point' in model coordinates.
    // *WHY* have modelHitPt? to evaluate procedural textures & materials.
    //      Remember, we define each CGeom objects as simply as possible in its
    // own 'model' coordinate system (e.g. fixed, unit size, axis-aligned, and
    // centered at origin) and each one uses its own worldRay2Model matrix
    // to customize them in world space.  We use that matrix to translate,
    // rotate, scale or otherwise transform the object in world space.
    // This means we must TRANSFORM rays from the camera's 'world' coord. sys.
    // to 'model' coord sys. before we trace the ray.  We find the ray's
    // collision length 't' in model space, but we can use it on the world-
    // space rays to find world-space hit-point as well.
    //      However, some materials and shading methods work best in model
    // coordinates too; for example, if we evaluate procedural textures
    // (grid-planes, checkerboards, 3D woodgrain textures) in the 'model'
    // instead of the 'world' coord system, they'll stay 'glued' to the CGeom
    // object as we move it around in world-space (by changing worldRay2Model
    // matrix), and the object's surface patterns won't change if we 'squeeze' 
    // or 'stretch' it by non-uniform scaling.
    this.colr = vec4.clone(g_myScene.skyColor);   // set default as 'sky'
                                // The final color we computed for this point,
                                // (note-- not used for showShadow rays).
                                // (uses RGBA. A==opacity, default A=1=opaque.
}

CHit.prototype.init  = function() {
//==============================================================================
// Set this CHit object to describe a 'sky' ray that hits nothing at all;
// clears away all CHit's previously-stored description of any ray hit-point.
  this.hitGeom = -1;            // (reference to)the CGeom object we pierced in
                                //  in the CScene.item[] array (null if 'none').
this.hitNum = -1; // TEMPORARY:
  // holds traceGrid() or traceDisk() result.

  this.t0 = g_t0_MAX;           // 'hit time' for the ray; defines one
                                // 'hit-point' along ray:   orig + t*dir = hitPt.
                                // (default: giant distance to very-distant-sky)
  vec4.set(this.hitPt, this.t0, 0,0,1); // Hit-point: the World-space location 
                                //  where the ray pierce surface of CGeom item.
  vec4.set(this.surfNorm,-1,0,0,0);  // World-space surface-normal vector 
                                // at the hit-point: perpendicular to surface.
  vec4.set(this.viewN,-1,0,0,0);// Unit-length vector from hitPt back towards
                                // the origin of the ray we traced.  (VERY
                                // useful for Phong lighting, etc.)
  this.isEntering=true;         // true iff ray origin was OUTSIDE the hitGeom.
                                //(example; transparency rays begin INSIDE).                                
  vec4.copy(this.modelHitPt,this.hitPt);// the 'hit point' in model coordinates.
}
 

function CHitList() {
//=============================================================================
// Holds ALL ray/object intersection results from tracing a single ray(CRay)
// sent through ALL shape-defining objects (CGeom) in in the item[] array in 
// our scene (CScene).  A CHitList object ALWAYS holds at least one valid CHit 
// 'hit-point', as we initialize the pierce[0] object to the CScene's 
//  background color.  Otherwise, each CHit element in the 'pierce[]' array
// describes one point on the ray where it enters or leaves a CGeom object.
// (each point is in front of the ray, not behind it; t>0).
//  -- 'iEnd' index selects the next available CHit object at the end of
//      our current list in the pierce[] array. if iEnd=0, the list is empty.
//  -- 'iNearest' index selects the CHit object nearest the ray's origin point.
	//
	//
	//
	//
	//  	YOU WRITE THIS!  
	//
	//
	//
	//
	//
}



function CScene() {
//=============================================================================
// This is a complete ray tracer object prototype (formerly a C/C++ 'class').
//      My code uses just one CScene instance (g_myScene) to describe the entire 
//			ray tracer.  Note that I could add more CScene objects to make multiple
//			ray tracers (perhaps run on different threads or processors) and then 
//			combine their results into a giant video sequence, a giant image, or 
//			use one ray-traced result as input to make the next ray-traced result.
//
//The CScene prototype includes:
// One CImgBuf object 'imgBuf' used to hold ray-traced result image.
//      (see CScene.setImgBuf() method below)
// One CCamera object that describes an antialiased ray-tracing camera;
//      in my code, it is the 'rayCam' variable within the CScene prototype.
//      The CCamera class defines the SOURCE of rays we trace from our eyepoint
//      into the scene, and uses those rays to set output image pixel values.
// One CRay object 'eyeRay' that describes the ray we're currently tracing from
//      eyepoint into the scene.
// a COLLECTION of CGeom objects: each describe an individual visible thing; a
//      single item or thing we may see in the scene.  That collection is the 
//			held in the 'item[]' array within the CScene class.
//      		Each CGeom element in the 'item[]' array holds one shape on-screen.
//      To see three spheres and a ground-plane we'll have 4 CGeom objects, one 
//			for each of the spheres, and one for the ground-plane.
//      Each CGeom obj. includes a 'matlIndex' index number that selects which
//      material to use in rendering the CGeom shape. I assume ALL lights in a
//      scene may affect ALL CGeom shapes, but you may wish to add an light-src
//      index to permit each CGeom object to choose which lights(s) affect it.
// One CHitList object 'eyeHits' that describes each 3D point where 'eyeRay'
//      pierces a shape (a CGeom object) in our CScene.  Each CHitList object
//      in our ray-tracer holds a COLLECTION of hit-points (CHit objects) for a
//      ray, and keeps track of which hit-point is closest to the camera. That
//			collection is held in the eyeHits member of the CScene class.
// a COLLECTION of CMatl objects; each describes one light-modifying material'
//      hold this collection in  'matter[]' array within the CScene class).
//      Each CMatl element in the 'matter[]' array describes one particular
//      individual material we will use for one or more CGeom shapes. We may
//      have one CMatl object that describes clear glass, another for a
//      Phong-shaded brass-metal material, another for a texture-map, another
//      for a bump mapped material for the surface of an orange (fruit),
//      another for a marble-like material defined by Perlin noise, etc.
// a COLLECTION of CLight objects that each describe one light source.  
//			That collection is held in the 'lamp[]' array within the CScene class.
//      Note that I apply all lights to all CGeom objects.  You may wish to add
//      an index to the CGeom class to select which lights affect each item.
//
// The default CScene constructor creates a simple scene that will create a
// picture if traced:
// --rayCam with +/- 45 degree Horiz field of view, aimed in the -Z direcion 
// 			from the world-space location (0,0,0),
// --item[0] is a ground-plane grid at z= -5.
//
//  Calling 'initScene()' lets you choose other scenes, such as:
//  --our 'rayCam' camera at (5,5,5) aimed at the origin;
//  --item[0] shape, a unit sphere at the origin that uses matter[0] material;
//  --matter[0] material is a shiny red Phong-lit material, lit by lamp[0];
//  --lamp[0] is a point-light source at location (5,5,5).


  this.RAY_EPSILON = 1.0E-10;       // ray-tracer precision limits; treat 
                                    // any value smaller than this as zero.
                                    // (why?  JS uses 52-bit mantissa;
                                    // 2^-52 = 2.22E-16, so what is a good
                                    // safety margin for small# calcs? Test it!)
                                    
  this.imgBuf = g_myPic;            // DEFAULT output image buffer
                                    // (change it with setImgBuf() if needed)
  this.eyeRay = new CRay();	        // the ray from the camera for each pixel
  this.eyeRays = [];                // Hold all sampling rays of a pixel
  this.rayCam = new CCamera();	    // the 3D camera that sets eyeRay values:
                                    // this is the DEFAULT camera (256,256).
                                    // (change it with setImgBuf() if needed)
  this.item = [];                   // this JavaScript array holds all the
                                    // CGeom objects of the  current scene.
  this.materials = [];   
  this.lamp = [];                   // this JavaScript array holds all the
}

CScene.prototype.setImgBuf = function(nuImg) {
//==============================================================================
// set/change the CImgBuf object we will fill with our ray-traced image.
// This is USUALLY the global 'g_myPic', but could be any CImgBuf of any
// size.  

  // Re-adjust ALL the CScene methods/members affected by output image size:
  this.rayCam.setSize(nuImg.xSiz, nuImg.ySiz);
  this.imgBuf = nuImg;    // set our ray-tracing image destination.
}

CScene.prototype.initScene = function(num) {
//==============================================================================
// Initialize our ray tracer, including camera-settings, output image buffer
// to use.  Then create a complete 3D scene (CGeom objects, materials, lights, 
// camera, etc) for viewing in both the ray-tracer **AND** the WebGL previewer.
// num == 0: basic ground-plane grid;
//     == 1: ground-plane grid + round 'disc' object;
//     == 2: ground-plane grid + sphere
//     == 3: ground-plane grid + sphere + 3rd shape, etc.

  if(num == undefined) num = 0;   // (in case setScene() called with no arg.)
  // Set up ray-tracing camera to use all the same camera parameters that
  // determine the WebGL preview.  GUIbox fcns can change these, so be sure
  // to update these again just before you ray-trace:
  this.rayCam.rayPerspective(gui.camFovy, gui.camAspect, gui.camNear);
  this.rayCam.rayLookAt(gui.camEyePt, gui.camAimPt, gui.camUpVec);
  this.setImgBuf(g_myPic);    // rendering target: our global CImgBuf object
                              // declared just above main().
  // Set default sky color:
  this.skyColor = vec4.fromValues( 0.0, 0.0, 0.0, 1.0);  // black
  // Empty the 'item[] array -- discard all leftover CGeom objects it may hold.
  this.item.length = 0;       
  var iNow = 0;         // index of the last CGeom object put into item[] array
  
  this.materials = [];
  this.lamp = [];
  // set up new scene:
  switch(num) {
    case 0:     // (default scene number; must create a 3D scene for ray-tracing
      console.log("Initialized Case 0")
      // create our list of CGeom shapes that fill our 3D scene:
      //---Ground Plane-----
      // draw this in world-space; no transforms!
      this.item.push(new CGeom(RT_GNDPLANE));   // Append gnd-plane to item[] array
      iNow = this.item.length -1;               // get its array index.
                                                // use default colors.
                                                // no transforms needed.
      this.item[iNow].matlIndex = 1;



      //-----Disk 1------           
      this.item.push(new CGeom(RT_DISK));         // Append 2D disk to item[] &
      iNow = this.item.length -1;                 // get its array index.
  	  vec4.set(this.item[iNow].gapColor,  0.3,0.6,0.7,1.0); // RGBA(A==opacity) bluish gray   
  	  vec4.set(this.item[iNow].lineColor, 0.7,0.3,0.3,1.0);  // muddy red
  	  this.item[iNow].setIdent();                   // start in world coord axes
      doTransforms(this.item[iNow], ShapeTransforms['disk1'], isRay=true);
      this.item[iNow].matlIndex = 2;

      //-----Disk 2------ 
      this.item.push(new CGeom(RT_DISK));         // Append 2D disk to item[] &
      iNow = this.item.length -1;                 // get its array index.
      vec4.set(this.item[iNow].gapColor,  0.0,0.0,1.0,1.0); // RGBA(A==opacity) blue
  	  vec4.set(this.item[iNow].lineColor, 1.0,1.0,0.0,1.0);  // yellow
  	  this.item[iNow].setIdent();                   // start in world coord axes
      doTransforms(this.item[iNow], ShapeTransforms['disk2'], isRay=true);
      this.item[iNow].matlIndex = 3;

      //-----Sphere 1-----
      this.item.push(new CGeom(RT_SPHERE));       // Append sphere to item[] &
      iNow = this.item.length -1;                 // get its array index.
  	  this.item[iNow].setIdent();                   // start in world coord axes
      doTransforms(this.item[iNow], ShapeTransforms['sphere1'], isRay=true);
      this.item[iNow].matlIndex = 4;
      
      //---Box 1-----
      this.item.push(new CGeom(RT_BOX));   // box
      iNow = this.item.length -1;
      this.item[iNow].setIdent();   
      doTransforms(this.item[iNow], ShapeTransforms['box1'], isRay=true);
      this.item[iNow].matlIndex = 5;



      //Materials
      this.materials.push(new Material(MATL_CHECKER_WHITE));
      this.materials.push(new Material(MATL_CHECKER_BLACK));
      this.materials.push(new Material(MATL_PEARL));
      this.materials.push(new Material(MATL_PEARL));
      this.materials.push(new Material(MATL_PEWTER));
      this.materials.push(new Material(MATL_OBSIDIAN));

      //Light1
      var I_ambi = vec4.fromValues(1.0, 1.0, 1.0, 0.0);
      var I_diff = vec4.fromValues(1.0, 1.0, 1.0, 0.0);
      var I_spec = vec4.fromValues(1.0, 1.0, 1.0, 0.0);
      this.lamp.push(new LightsT(Light1Pos, I_ambi, I_diff, I_spec));

      //Light2
      var I_ambi = vec4.fromValues(1.0, 1.0, 1.0, 0.0);
      var I_diff = vec4.fromValues(1.0, 1.0, 1.0, 0.0);
      var I_spec = vec4.fromValues(1.0, 1.0, 1.0, 0.0);
      this.lamp.push(new LightsT(Light2Pos, I_ambi, I_diff, I_spec));
      break;
    case 1:
      this.item.push(new CGeom(RT_GNDPLANE));   // Append gnd-plane to item[] array
      iNow = this.item.length -1;               // get its array index.
                                                // use default colors.
                                                // no transforms needed.
      this.item[iNow].matlIndex = 1;

      //-----Sphere 1-----
      this.item.push(new CGeom(RT_SPHERE));       // Append sphere to item[] &
      iNow = this.item.length -1;                 // get its array index.
  	  this.item[iNow].setIdent();                   // start in world coord axes
      doTransforms(this.item[iNow], ShapeTransforms['case1_Sphere1'], isRay=true);
      this.item[iNow].matlIndex = 2;

      //-----Sphere 1-----
      this.item.push(new CGeom(RT_SPHERE));       // Append sphere to item[] &
      iNow = this.item.length -1;                 // get its array index.
  	  this.item[iNow].setIdent();                   // start in world coord axes
      doTransforms(this.item[iNow], ShapeTransforms['case1_Sphere2'], isRay=true);
      this.item[iNow].matlIndex = 3;

      //-----Sphere 1-----
      this.item.push(new CGeom(RT_SPHERE));       // Append sphere to item[] &
      iNow = this.item.length -1;                 // get its array index.
  	  this.item[iNow].setIdent();                   // start in world coord axes
      doTransforms(this.item[iNow], ShapeTransforms['case1_Sphere3'], isRay=true);
      this.item[iNow].matlIndex = 4;

      //-----Sphere 1-----
      this.item.push(new CGeom(RT_SPHERE));       // Append sphere to item[] &
      iNow = this.item.length -1;                 // get its array index.
  	  this.item[iNow].setIdent();                   // start in world coord axes
      console.log(ShapeTransforms['case1_Sphere4'])
      doTransforms(this.item[iNow], ShapeTransforms['case1_Sphere4'], isRay=true);
      this.item[iNow].matlIndex = 5;

      //-----Sphere 1-----
      this.item.push(new CGeom(RT_SPHERE));       // Append sphere to item[] &
      iNow = this.item.length -1;                 // get its array index.
  	  this.item[iNow].setIdent();                   // start in world coord axes
      doTransforms(this.item[iNow], ShapeTransforms['case1_Sphere5'], isRay=true);
      this.item[iNow].matlIndex = 6;

      //-----Sphere 1-----
      this.item.push(new CGeom(RT_SPHERE));       // Append sphere to item[] &
      iNow = this.item.length -1;                 // get its array index.
  	  this.item[iNow].setIdent();                   // start in world coord axes
      doTransforms(this.item[iNow], ShapeTransforms['case1_Sphere6'], isRay=true);
      this.item[iNow].matlIndex = 7;

      //Materials
      this.materials.push(new Material(MATL_CHECKER_WHITE));
      this.materials.push(new Material(MATL_CHECKER_BLACK));
      this.materials.push(new Material(MATL_PEWTER));
      this.materials.push(new Material(MATL_CHECKER_WHITE));
      this.materials.push(new Material(MATL_OBSIDIAN));
      this.materials.push(new Material(MATL_TURQUOISE));
      this.materials.push(new Material(MATL_BLACK_RUBBER));
      this.materials.push(new Material(MATL_PEARL));

      //Light1
      var I_ambi = vec4.fromValues(1.0, 1.0, 1.0, 0.0);
      var I_diff = vec4.fromValues(1.0, 1.0, 1.0, 0.0);
      var I_spec = vec4.fromValues(1.0, 1.0, 1.0, 0.0);
      this.lamp.push(new LightsT(Light1Pos, I_ambi, I_diff, I_spec));

      //Light2
      var I_ambi = vec4.fromValues(1.0, 1.0, 1.0, 0.0);
      var I_diff = vec4.fromValues(1.0, 1.0, 1.0, 0.0);
      var I_spec = vec4.fromValues(1.0, 1.0, 1.0, 0.0);
      this.lamp.push(new LightsT(Light2Pos, I_ambi, I_diff, I_spec));
      break;

    case 2:
      this.item.push(new CGeom(RT_GNDPLANE));   // Append gnd-plane to item[] array
      iNow = this.item.length -1;               // get its array index.
                                                // use default colors.
                                                // no transforms needed.
      this.item[iNow].matlIndex = 1;

      //-----Sphere 1-----
      this.item.push(new CGeom(RT_SPHERE));       // Append sphere to item[] &
      iNow = this.item.length -1;                 // get its array index.
  	  this.item[iNow].setIdent();                   // start in world coord axes
      doTransforms(this.item[iNow], ShapeTransforms['case2_Sphere1'], isRay=true);
      this.item[iNow].matlIndex = 2;

      //-----Sphere 2-----
      this.item.push(new CGeom(RT_SPHERE));       // Append sphere to item[] &
      iNow = this.item.length -1;                 // get its array index.
  	  this.item[iNow].setIdent();                   // start in world coord axes
      doTransforms(this.item[iNow], ShapeTransforms['case2_Sphere2'], isRay=true);
      this.item[iNow].matlIndex = 3;

      //-----Sphere 3-----
      this.item.push(new CGeom(RT_SPHERE));       // Append sphere to item[] &
      iNow = this.item.length -1;                 // get its array index.
  	  this.item[iNow].setIdent();                   // start in world coord axes
      doTransforms(this.item[iNow], ShapeTransforms['case2_Sphere3'], isRay=true);
      this.item[iNow].matlIndex = 4;

      //-----Sphere 4 Left Eye-----
      this.item.push(new CGeom(RT_SPHERE));       // Append sphere to item[] &
      iNow = this.item.length -1;                 // get its array index.
  	  this.item[iNow].setIdent();                   // start in world coord axes
      doTransforms(this.item[iNow], ShapeTransforms['case2_Sphere_LeftEye'], isRay=true);
      this.item[iNow].matlIndex = 5;

      //-----Sphere 4 Right Eye-----
      this.item.push(new CGeom(RT_SPHERE));       // Append sphere to item[] &
      iNow = this.item.length -1;                 // get its array index.
  	  this.item[iNow].setIdent();                   // start in world coord axes
      doTransforms(this.item[iNow], ShapeTransforms['case2_Sphere_RightEye'], isRay=true);
      this.item[iNow].matlIndex = 6;

      // Mouth
      this.item.push(new CGeom(RT_BOX));   // box
      iNow = this.item.length -1;
      this.item[iNow].setIdent();   
      doTransforms(this.item[iNow], ShapeTransforms['case2_Box_Mouth'], isRay=true);
      this.item[iNow].matlIndex = 7;

      // Left Arm
      this.item.push(new CGeom(RT_BOX));   // box
      iNow = this.item.length -1;
      this.item[iNow].setIdent();   
      doTransforms(this.item[iNow], ShapeTransforms['case2_Box_LeftArm'], isRay=true);
      this.item[iNow].matlIndex = 8;

      // Right Arm
      this.item.push(new CGeom(RT_BOX));   // box
      iNow = this.item.length -1;
      this.item[iNow].setIdent();   
      doTransforms(this.item[iNow], ShapeTransforms['case2_Box_RightArm'], isRay=true);
      this.item[iNow].matlIndex = 9;

      //Materials
      this.materials.push(new Material(MATL_CHECKER_WHITE));
      this.materials.push(new Material(MATL_CHECKER_BLACK));
      this.materials.push(new Material(MATL_PEWTER));  // Snowman base
      this.materials.push(new Material(MATL_PEWTER));  // Middle
      this.materials.push(new Material(MATL_PEWTER));  // Head
      this.materials.push(new Material(MATL_CHROME));  // Left Eye
      this.materials.push(new Material(MATL_CHROME));  // Right Eye
      this.materials.push(new Material(MATL_GOLD_DULL));  // Mouth
      this.materials.push(new Material(MATL_GOLD_DULL));  // Left Arm
      this.materials.push(new Material(MATL_GOLD_DULL));  // Right Arm



      //Light1
      var I_ambi = vec4.fromValues(1.0, 1.0, 1.0, 0.0);
      var I_diff = vec4.fromValues(1.0, 1.0, 1.0, 0.0);
      var I_spec = vec4.fromValues(1.0, 1.0, 1.0, 0.0);
      this.lamp.push(new LightsT(Light1Pos, I_ambi, I_diff, I_spec));

      //Light2
      var I_ambi = vec4.fromValues(1.0, 1.0, 1.0, 0.0);
      var I_diff = vec4.fromValues(1.0, 1.0, 1.0, 0.0);
      var I_spec = vec4.fromValues(1.0, 1.0, 1.0, 0.0);
      this.lamp.push(new LightsT(Light2Pos, I_ambi, I_diff, I_spec));
      break;

    case 3:
      this.item.push(new CGeom(RT_GNDPLANE));   // Append gnd-plane to item[] array
      iNow = this.item.length -1;               // get its array index.
                                                // use default colors.
                                                // no transforms needed.
      this.item[iNow].matlIndex = 1;

      //-----Sphere 1-----
      this.item.push(new CGeom(RT_SPHERE));       // Append sphere to item[] &
      iNow = this.item.length -1;                 // get its array index.
  	  this.item[iNow].setIdent();                   // start in world coord axes
      doTransforms(this.item[iNow], ShapeTransforms['case3_Sphere1'], isRay=true);
      this.item[iNow].matlIndex = 2;

      //-----Sphere 1-----
      this.item.push(new CGeom(RT_SPHERE));       // Append sphere to item[] &
      iNow = this.item.length -1;                 // get its array index.
  	  this.item[iNow].setIdent();                   // start in world coord axes
      doTransforms(this.item[iNow], ShapeTransforms['case3_Sphere2'], isRay=true);
      this.item[iNow].matlIndex = 3;

      //-----Sphere 1-----
      this.item.push(new CGeom(RT_SPHERE));       // Append sphere to item[] &
      iNow = this.item.length -1;                 // get its array index.
  	  this.item[iNow].setIdent();                   // start in world coord axes
      doTransforms(this.item[iNow], ShapeTransforms['case3_Sphere3'], isRay=true);
      this.item[iNow].matlIndex = 4;

      //Materials
      this.materials.push(new Material(MATL_CHECKER_WHITE));
      this.materials.push(new Material(MATL_CHECKER_BLACK));
      this.materials.push(new Material(MATL_PEWTER));
      this.materials.push(new Material(MATL_PEWTER));
      this.materials.push(new Material(MATL_OBSIDIAN));

      //Light1
      var I_ambi = vec4.fromValues(1.0, 1.0, 1.0, 0.0);
      var I_diff = vec4.fromValues(1.0, 1.0, 1.0, 0.0);
      var I_spec = vec4.fromValues(1.0, 1.0, 1.0, 0.0);
      this.lamp.push(new LightsT(Light1Pos, I_ambi, I_diff, I_spec));

      //Light2
      var I_ambi = vec4.fromValues(1.0, 1.0, 1.0, 0.0);
      var I_diff = vec4.fromValues(1.0, 1.0, 1.0, 0.0);
      var I_spec = vec4.fromValues(1.0, 1.0, 1.0, 0.0);
      this.lamp.push(new LightsT(Light2Pos, I_ambi, I_diff, I_spec));
      break;

    default:    // nonsensical 'sceneNum' value?
      console.log("JT_tracer0-Scene file: CScene.initScene(",num,") NOT YET IMPLEMENTED.");
      this.initScene(0);   // init the default scene.
      break;
  }
}

CScene.prototype.makeRayTracedImage = function() {
  //==============================================================================
  // Create an image by Ray-tracing; fill CImgBuf object  'imgBuf' with result.
  // (called when you press 'T' or 't')

  //	console.log("You called CScene.makeRayTracedImage!")
  // Update our ray-tracer camera to match the WebGL preview camera:
  this.rayCam.rayPerspective(gui.camFovy, gui.camAspect, gui.camNear);
  this.rayCam.rayLookAt(gui.camEyePt, gui.camAimPt, gui.camUpVec);

  this.setImgBuf(this.imgBuf);
                                  
  var colr = vec4.create();	
  var idx = 0;
  
  this.pixFlag = 0;
  var myHit = new CHit();

  for (let i=0; i < g_AAcode * g_AAcode; i++) {
    this.eyeRays.push(new CRay());
  }        
  for(let j=0; j< this.imgBuf.ySiz; j++) {
    for(let i=0; i< this.imgBuf.xSiz; i++) {
      
      var sample_w = 1/g_AAcode;
      vec4.set(colr, 0, 0, 0, 0);

      for(var m = 0; m < g_AAcode; m++){
        for(var n = 0; n< g_AAcode; n++){
          if (g_isJitter) {
            sample_i = i + m * sample_w + Math.random() * sample_w;
            sample_j = j + n * sample_w + Math.random() * sample_w;
          }
          else {
            sample_i = i + m * sample_w + 0.5 * sample_w;
            sample_j = j + n * sample_w + 0.5 * sample_w;
          }
          this.rayCam.setEyeRay(this.eyeRays[m*g_AAcode + n], sample_i, sample_j);
          this.currReflCount = 0;
          myHit.init();
          for(let k=0; k< this.item.length; k++) {
            this.item[k].traceMe(this.eyeRays[m*g_AAcode + n], myHit);
          }
          this.findShade(myHit);
          vec4.add(colr, colr, vec4.divide(myHit.colr, myHit.colr, [Math.pow(g_AAcode, 2),Math.pow(g_AAcode, 2),Math.pow(g_AAcode, 2),Math.pow(g_AAcode, 2)]));
        }
      }
      idx = (j*this.imgBuf.xSiz + i)*this.imgBuf.pixSiz;
      this.imgBuf.fBuf[idx   ] = colr[0];	
      this.imgBuf.fBuf[idx +1] = colr[1];
      this.imgBuf.fBuf[idx +2] = colr[2];
    }
  }
  this.imgBuf.float2int();
}

CScene.prototype.findShade = function(myHit) {
    var L_Ray = new CRay();
    var L_Color = vec4.fromValues(0.0, 0.0, 0.0, 0.0);
    if (myHit.hitGeom == -1) {
      L_Color = vec4.fromValues(0.0, 0.0, 0.0, 1.0);
      vec4.copy(myHit.colr, L_Color);
      return;
    }
  
    if (Light1Enabled) {
      this.lamp[0].enabled = true;
    }
    else {
      this.lamp[0].enabled = false;
    }

    if (Light2Enabled) {
      this.lamp[1].enabled = true;
    }
    else {
      this.lamp[1].enabled = false;
    }

    this.lamp[0].pos = Light1Pos;
    this.lamp[1].pos = Light2Pos;
  
    for(let i=0; i < this.lamp.length; i++) {
      if (this.lamp[i].enabled) {
  
        
        vec4.copy(L_Ray.orig, myHit.hitPt);
        vec4.subtract(L_Ray.dir, this.lamp[i].pos, myHit.hitPt);
        vec4.normalize(L_Ray.dir, L_Ray.dir);
        var temp = vec4.create();
        vec4.scale(temp, L_Ray.dir, 100 * this.RAY_EPSILON);
        vec4.add(L_Ray.orig, L_Ray.orig, temp);
  
        var newHit = new CHit();
        newHit.init();
        var showShadow = false;
        for(let k=0; k< this.item.length; k++) { 
          this.item[k].traceMe(L_Ray, newHit, "2"); 
        }
        if (newHit.hitGeom != -1) {showShadow = true;}
  
        var myMat;
        if(myHit.hitGeom == 0){
          tot = Math.floor(myHit.hitPt.x/myHit.hitGeom.xgap) + Math.floor(myHit.hitPt.y/myHit.hitGeom.ygap) + Math.floor(myHit.hitPt.z/myHit.hitGeom.zgap);
          if(tot < 0) myHit.hitGeom.y = -myHit.hitGeom.y;
          if(myHit.hitGeom.y > .5)  myMat = this.materials[1];
          else myMat = this.materials[0];
        }
        else{
          myMat = this.materials[myHit.hitGeom.matlIndex];
        }
        vec4.add(L_Color, L_Color, myMat.K_emit);
        vec4.multiply(temp, this.lamp[i].I_ambi, myMat.K_ambi);
        vec4.add(L_Color, L_Color, temp);
        if (!showShadow) {
          var L = vec3.fromValues(L_Ray.dir[0], L_Ray.dir[1], L_Ray.dir[2]);
          var N = vec3.fromValues(myHit.surfNorm[0], myHit.surfNorm[1], myHit.surfNorm[2]);
          var NdotL = vec3.dot(N, L);
  
          var C = vec3.create();
          vec3.scale(C, N, NdotL);
          var Rvec3 = vec3.create();
          vec3.scale(temp, C, 2.0);
          vec3.subtract(Rvec3, temp, L);
          RdotV = vec3.dot(Rvec3, vec3.fromValues(myHit.viewN[0], myHit.viewN[1], myHit.viewN[2]));
  
          vec4.multiply(temp, this.lamp[i].I_diff, myMat.K_diff);
          vec4.scale(temp, temp, Math.max(0, NdotL));
          vec4.add(L_Color, L_Color, temp);
          vec4.multiply(temp, this.lamp[i].I_spec, myMat.K_spec);
          vec4.scale(temp, temp, Math.pow(Math.max(0, (RdotV)), myMat.K_shiny));
          vec4.add(L_Color, L_Color, temp);
  
          if (this.currReflCount < targetReflectionDepth) {
            this.currReflCount += 1;
  
            var V = vec3.fromValues(myHit.viewN[0], myHit.viewN[1], myHit.viewN[2]);
            var NdotV = vec3.dot(N, V);
            var D = vec3.create();
            vec3.scale(D, N, NdotV);
            var M = vec3.create();
            vec3.scale(temp, D, 2.0);
            vec3.subtract(M, temp, V);
  
            var M_Ray = new CRay();
            vec4.copy(M_Ray.orig, myHit.hitPt);
            vec4.copy(M_Ray.dir, vec4.fromValues(M[0], M[1], M[2], 0.0));
            vec4.add(M_Ray.orig, M_Ray.orig, vec4.scale(temp, M_Ray.dir, 100 * this.RAY_EPSILON));
            var newHitRefl = new CHit();
            newHitRefl.init();
            for(let k=0; k< this.item.length; k++) {
              this.item[k].traceMe(M_Ray, newHitRefl, "3");
            }    
            this.findShade(newHitRefl);
            vec4.scale(temp, newHitRefl.colr, myMat.K_mirr[0]);
            vec4.add(L_Color, L_Color, temp);
          }
        }
      }
    }
    vec4.copy(myHit.colr, L_Color);
  }