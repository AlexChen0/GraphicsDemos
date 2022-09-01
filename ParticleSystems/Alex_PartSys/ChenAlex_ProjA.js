//3456789_123456789_123456789_123456789_123456789_123456789_123456789_123456789_
// (JT: why the numbers? counts columns, helps me keep 80-char-wide listings)
//
// ORIGINAL SOURCE:
// RotatingTranslatedTriangle.js (c) 2012 matsuda
// HIGHLY MODIFIED to make:
//
// BouncyBall.js  for EECS 351-1, 
//									Northwestern Univ. Jack Tumblin
//  (see previous week's starter code for earlier versions)
//  PartSysBouncy10:---------------------
//    --UPDATE keyboard handler to eliminate now-deprecated 'KeyPress' callback.
//			as the program starts, when users press the 'R' key too ('deep reset').  
//			Make a related function for the 'r' key that updates only the velocities 
//			for all particles in the current state.
//    --add 'f/F' key to toggle age constraint (particle fountain).
//    --Refine 'partSys.js' file to hold PartSys prototype & related items.
//    --SIMPLIFY, REDISTRIBUTE our still-too-large 'draw' function:
//      1) move the constraint-applying code to the 'A.applyConstraints(). 
//      Improve it: apply constraints to ALL particles in the state-variable(s).
//      2) Replace the tedious variable-by-variable swapping of s1,s2 elements
//      in drawAll() with a call to 'A.swap()', a function that switches 
//			the contents of the s1  and s2 state vars (see week2 starter code named
//        'swapTest' to BE SURE it swaps references only; NOT a 'deep copy'!!)
//      3) Move particle-movement-solving code from 'draw()' to partA.solver().
//  PartSysBouncy12:
//      4) Add particle-aging constraint: 'f/F' key toggles fire-like 'fountain' 
//      5) Update 'drawAll()' to follow the recommended simulation loop given
//        in lecture notes D :
//      ApplyAllForces(), dotFinder(), Solver(), doConstraint(), Swap(), Render(),
//      (also: remove unneeded swap() calls at start of Solver()!)  
//  PartSysBouncy13:
//      5) Create s1dot state var (in PartSys.prototype.initBouncy2D() fcn),
//        Create a force-applying 'CForcer' object prototype and constraint-applying 
//        object 'CLimit' at the end of PartSys05
//      6) In PartSys.initBouncy2D(),create 'this.forceList' array of CForcers
//        and 'push' a CForcer for Earth gravity onto the array; 
//        Create 'this.limitList' array of CLimit objects and 'push' a CLimit
//        object for our LIM_VOL box-like enclosure onto the array;
//      7) implement the 'applyForces()' and 'dotFinder()' functions using
//        A.forceList array, the A.s1 array, and A.s1dot array.
//      8) use s1,s2, and s1dot to implement Euler solver in solver().
//  PartSysBouncy14:
//      9) correct bugs (e.g. solver() SOLV_EULER loop indices & array indices;
//        single-step), 
//       clean up code for keyDown(), add a 'drag' CForcer SOLV_EULER needed; 
//       add CForcer.printMe(),

//      update the 'doConstraints()' function to use CLimit objects in 
//        A.limitList() to implement the box that holds our particles..

//==============================================================================
// Vertex shader program:
var VSHADER_SOURCE =
  'precision mediump float;\n' +
  'uniform   int u_runMode; \n' +
  'attribute vec4 a_Position;\n' +
  'attribute float a_LifeLeft;\n' +
  'attribute float a_Age;\n' +
  'attribute vec3 a_RGB;\n' +
  'attribute float a_Diameter;\n' +
  'uniform mat4 u_ModelMatrix;\n' +
  'varying   vec4 v_Color; \n' +
  'void main() {\n' +
  '  gl_PointSize = a_Diameter;\n' +            // TRY MAKING THIS LARGER...
  '	 gl_Position = u_ModelMatrix * a_Position; \n' +	
  '  v_Color = vec4(a_RGB[0], a_RGB[1], a_RGB[2] + a_Age - a_Age + a_LifeLeft - a_LifeLeft, 1); \n' +
  '} \n';
// Each instance computes all the on-screen attributes for just one VERTEX,
// supplied by 'attribute vec4' variable a_Position, filled from the 
// Vertex Buffer Object (VBO) created in A.init().

//==============================================================================
// Fragment shader program:
var FSHADER_SOURCE =
  'precision mediump float;\n' +
  'varying vec4 v_Color; \n' +
  'void main() {\n' +
  '  float dist = distance(gl_PointCoord, vec2(0.5, 0.5)); \n' +
  '  if(dist < 0.5) { \n' +	
	'  	gl_FragColor = vec4((1.0-2.0*dist)*v_Color.rgb, 1.0);\n' +
	'  } else { discard; }\n' +
  '}\n';

var gl;   // webGL Rendering Context.  Created in main(), used everywhere.
var g_canvas; // our HTML-5 canvas object that uses 'gl' for drawing.
var g_digits = 5; // # of digits printed on-screen (e.g. x.toFixed(g_digits);

// For keyboard, mouse-click-and-drag: -----------------
var isDrag=false;		// mouse-drag: true when user holds down mouse button
var xMclik=0.0;			// last mouse button-down position (in CVV coords)
var yMclik=0.0;   
var xMdragTot=0.0;	// total (accumulated) mouse-drag amounts (in CVV coords).
var yMdragTot=0.0;  

//--Animation---------------
var g_isClear = 1;		  // 0 or 1 to enable or disable screen-clearing in the
    									// draw() function. 'C' or 'c' key toggles in myKeyPress().
var g_last = Date.now();				//  Timestamp: set after each frame of animation,
																// used by 'animate()' function to find how much
																// time passed since we last updated our canvas.
var g_stepCount = 0;						// Advances by 1 for each timestep, modulo 1000, 
																// (0,1,2,3,...997,998,999,0,1,2,..) to identify 
																// WHEN the ball bounces.  RESET by 'r' or 'R' key.

var g_timeStep = 1000.0/60.0;			// current timestep in milliseconds (init to 1/60th sec) 
var g_timeStepMin = g_timeStep;   //holds min,max timestep values since last keypress.
var g_timeStepMax = g_timeStep;


// Our first global particle system object; contains 'state variables' s1,s2;
//---------------------------------------------------------
var FireReeves = new PartSys();   // create our first particle-system object for code, see PartSys.js
var Rope = new PartSys();
var Planets = new PartSys();
var Boids = new PartSys();
var partSysArray = [FireReeves, Rope, Planets, Boids];

var gndGridVBO = new VBObox0();
var cubeContainerVBO = new VBOCube();


function main() {
	g_canvas = document.getElementById('webgl');
	gl = g_canvas.getContext("webgl", { preserveDrawingBuffer: true});

	if (!gl) {
		console.log('main() Failed to get the rendering context for WebGL');
		return;
	}  

	window.addEventListener("keydown", myKeyDown, false);
	window.addEventListener("keyup", myKeyUp, false);
	window.addEventListener("mousedown", myMouseDown); 
 	window.addEventListener("mousemove", myMouseMove); 
	window.addEventListener("mouseup", myMouseUp);	
	window.addEventListener("click", myMouseClick);				
	window.addEventListener("dblclick", myMouseDblClick); 

	// Initialize VBOs
	gndGridVBO.init(gl);
	cubeContainerVBO.init(gl);

	// Initialize shaders
	if (!initShaders(gl, VSHADER_SOURCE, FSHADER_SOURCE)) {
		console.log('main() Failed to intialize shaders.');
		return;
	}
	// Get handle to graphics system's storage location of u_ModelMatrix
	var u_ModelMatrix = gl.getUniformLocation(gl.program, 'u_ModelMatrix');
	if (!u_ModelMatrix) {
		console.log('Failed to get the storage location of u_ModelMatrix');
		return;
	}
	gl.clearColor(0.5, 0.5, 0.5, 1);	// RGBA color for clearing WebGL framebuffer
	gl.clear(gl.COLOR_BUFFER_BIT);	    // clear it once to set that color as bkgnd.

	// Initialize Particle systems:
	FireReeves.initFireReeves(600);
	Rope.initSpringRope(15);
	Planets.initOrbits(300);
	Boids.initFlocking(100);
	printControls(); 	// Display (initial) particle system values as text on webpage
	modelMatrix = new Matrix4();
	var tick = function() {
		g_timeStep = animate(); 
		if(g_timeStep > 200) {   // did we wait > 0.2 seconds? 
			g_timeStep = 1000/60;
		}
		// Update min/max for timeStep:
		if     (g_timeStep < g_timeStepMin) g_timeStepMin = g_timeStep;  
		else if (g_timeStep > g_timeStepMax) g_timeStepMax = g_timeStep;
		drawAll(modelMatrix, u_ModelMatrix); // compute new particle state at current time
		requestAnimationFrame(tick, g_canvas);
	};
	tick();
}

function animate() {
//==============================================================================  
// Returns how much time (in milliseconds) passed since the last call to this fcn.
  var now = Date.now();	        
  var elapsed = now - g_last;	// amount of time passed, in integer milliseconds
  g_last = now;               // re-set our stopwatch/timer.

  // INSTRUMENTATION:  (delete if you don't care how much the time-steps varied)
  g_stepCount = (g_stepCount +1)%1000;		// count 0,1,2,...999,0,1,2,...
  //-----------------------end instrumentation
  return elapsed;
}

var eyePos = new Vector3([0.0, -28, 4.0]);
var lookAtPos = new Vector3([0.0, 0.0, 3.0]);
var up = new Vector3([0, 0, 1]);

let width;
let aspect;
let near;
let far;
let fov = 42.0;

let sam = 0;
function drawAll(modelMatrix, u_ModelMatrix) {
	width = g_canvas.clientWidth;
	aspect = width / g_canvas.clientHeight;
	near = 1.0;
	far = 1000.0;

	// // Make it 3D
	modelMatrix.setIdentity();
	var veyePos = eyePos.elements;
	var vlookAtPos = lookAtPos.elements;
	var vup = up.elements;
	modelMatrix.perspective(42.0,   // FOVY: top-to-bottom vertical image angle, in degrees
							aspect,   // Image Aspect Ratio: camera lens width/height
							near,   // camera z-near distance (always positive; frustum begins at z = -znear)
							far);  // camera z-far distance (always positive; frustum ends at z = -zfar)
	modelMatrix.lookAt( veyePos[0],     veyePos[1],     veyePos[2],    // Camera Position
						vlookAtPos[0],  vlookAtPos[1],  vlookAtPos[2],    // Position of object looking at
						vup[0],      vup[1],      vup[2]);
	modelMatrix.translate(0, 0, 1);
	gl.uniformMatrix4fv(u_ModelMatrix, false, modelMatrix.elements);
	if(g_isClear == 1) gl.clear(gl.COLOR_BUFFER_BIT);

	gndGridVBO.switchToMe();
	gndGridVBO.adjust();
	gndGridVBO.draw();

	

	 // Clear WebGL frame-buffer? (The 'c' or 'C' key toggles g_isClear between 0 & 1).
	 ropeTranslation = [-1.0, 0.0, 0.0];
	 ropeScale = [5.4, 5.4, 5.4];
	 if(  Rope.runMode > 1) {	// 0=reset; 1= pause; 2=step; 3=run
	 	if(Rope.runMode == 2) { // (if runMode==2, do just one step & pause)
	 		Rope.runMode=1;
	 	}
	 	drawConstraints('cube', ropeTranslation, ropeScale);
	 	Rope.switchToMe();
	 	Rope.applyForces(Rope.s1, Rope.forceList);  // find current net force on each particle
	 	Rope.dotFinder(Rope.s1dot, Rope.s1); // find time-derivative s1dot from s1;
	 	Rope.solver();         // find s2 from s1 & related states.
	 	Rope.doConstraints();  // Apply all constraints.  s2 is ready!
	 	pushMatrix(modelMatrix);
	 	modelMatrix.translate(-8.1, 2.7, 2.0);
		modelMatrix.scale(3.0, 3.0, 3.0);
	 	gl.uniformMatrix4fv(u_ModelMatrix, false, modelMatrix.elements);
	 	Rope.render();         // transfer current state to VBO, set uniforms, draw it!
	 	modelMatrix = popMatrix();
	 	Rope.swap();
	 }
	 else {
	 	Rope.switchToMe();
	 	Rope.render();
	 }

	// Clear WebGL frame-buffer? (The 'c' or 'C' key toggles g_isClear between 0 & 1).
	fireTranslation = [-2.0, 0.0, 0.0];
	fireScale = [5.4, 5.4, 5.4];
	if(  FireReeves.runMode > 1) {	// 0=reset; 1= pause; 2=step; 3=run
	if(FireReeves.runMode == 2) { // (if runMode==2, do just one step & pause)
			FireReeves.runMode=1;
		}
	 	drawConstraints('cube', fireTranslation, fireScale);
	 	FireReeves.switchToMe();
	 	FireReeves.applyForces(FireReeves.s1, FireReeves.forceList);  // find current net force on each particle
	 	// FireReeves.ageParticle(FireReeves.s1);
	 	FireReeves.dotFinder(FireReeves.s1dot, FireReeves.s1); // find time-derivative s1dot from s1;
	 	FireReeves.solver();         // find s2 from s1 & related states.
	 	FireReeves.doConstraints();  // Apply all constraints.  s2 is ready!
	 	pushMatrix(modelMatrix);
	 	modelMatrix.translate(-2.7, 0.0, 2.0);
		modelMatrix.scale(2.5, 2.5, 2.5);
	 	gl.uniformMatrix4fv(u_ModelMatrix, false, modelMatrix.elements);
	 	FireReeves.render();         // transfer current state to VBO, set uniforms, draw it!
	 	modelMatrix = popMatrix();
	 	FireReeves.swap();           // Make s2 the new current state s1.s
	 }
	 else {
	 	FireReeves.switchToMe();
	 	FireReeves.render();
	 }

	

	// Planets
	orbitsTranslation = [0.0, 0.0, 0.0];
	orbitsScale = [5.4, 5.4, 5.4];
	if(  Planets.runMode > 1) {	// 0=reset; 1= pause; 2=step; 3=run
		if(Planets.runMode == 2) { // (if runMode==2, do just one step & pause)
			Planets.runMode=1;
		}
		drawConstraints('cube', orbitsTranslation, orbitsScale);
		Planets.switchToMe();
		Planets.applyForces(Planets.s1, Planets.forceList); 
		Planets.dotFinder(Planets.s1dot, Planets.s1); // find time-derivative s1dot from s1;
		Planets.solver();         // find s2 from s1 & related states.
		Planets.doConstraints();  // Apply all constraints.  s2 is ready!
		pushMatrix(modelMatrix);
		modelMatrix.translate(0.9 * 3, 0.9 * 3, 1.8);
		gl.uniformMatrix4fv(u_ModelMatrix, false, modelMatrix.elements);
		Planets.render();         // transfer current state to VBO, set uniforms, draw it!
		modelMatrix = popMatrix();
		Planets.swap();
	}
	else {
		Planets.switchToMe();
		Planets.render();
	}
/* doesnt work :(
	// Planets but without earth gravity -- more for fun, not a grade!
	if(  PlanetsNoGravity.runMode > 1) {	// 0=reset; 1= pause; 2=step; 3=run
		if(PlanetsNoGravity.runMode == 2) { // (if runMode==2, do just one step & pause)
			PlanetsNoGravity.runMode=1;
		}
		drawConstraints('cube', orbitsTranslation, orbitsScale);
		PlanetsNoGravity.switchToMe();
		PlanetsNoGravity.applyForces(PlanetsNoGravity.s1, PlanetsNoGravity.forceList); 
		PlanetsNoGravity.dotFinder(PlanetsNoGravity.s1dot, PlanetsNoGravity.s1); // find time-derivative s1dot from s1;
		PlanetsNoGravity.solver();         // find s2 from s1 & related states.
		PlanetsNoGravity.doConstraints();  // Apply all constraints.  s2 is ready!
		pushMatrix(modelMatrix);
		modelMatrix.translate(0.9 * 6, 0.9 * 6, 1.8);
		gl.uniformMatrix4fv(u_ModelMatrix, false, modelMatrix.elements);
		PlanetsNoGravity.render();         // transfer current state to VBO, set uniforms, draw it!
		modelMatrix = popMatrix();
		PlanetsNoGravity.swap();
	}
	else {
		PlanetsNoGravity.switchToMe();
		PlanetsNoGravity.render();
	}
*/
	 // Clear WebGL frame-buffer? (The 'c' or 'C' key toggles g_isClear between 0 & 1).
	 boidsTranslation = [1.0, 0.0, 0.0];
	 boidsScale = [5.4, 5.4, 5.4];
	 if(  Boids.runMode > 1) {	// 0=reset; 1= pause; 2=step; 3=run
	 	if(Boids.runMode == 2) { // (if runMode==2, do just one step & pause)
	 		Boids.runMode=1;
			  	}
	 	drawConstraints('cube', boidsTranslation, boidsScale);
	 	Boids.switchToMe();
	 	Boids.applyForces(Boids.s1, Boids.forceList);  // find current net force on each particle
	 	Boids.dotFinder(Boids.s1dot, Boids.s1); // find time-derivative s1dot from s1;
	 	Boids.solver();         // find s2 from s1 & related states.
	 	Boids.doConstraints();  // Apply all constraints.  s2 is ready!
	 	pushMatrix(modelMatrix);
	 	modelMatrix.translate(8.1, 0.9 * 3, 1.8);
	 	gl.uniformMatrix4fv(u_ModelMatrix, false, modelMatrix.elements);
	 	Boids.render();         // transfer current state to VBO, set uniforms, draw it!
	 	modelMatrix = popMatrix();
	 	Boids.swap();           // Make s2 the new current state s1.s
	 }
	 else {
	 	Boids.switchToMe();
	 	Boids.render();
	 }

	printControls();
	document.getElementById('MouseResult0').innerHTML=
			'Mouse Drag totals (CVV coords):\t' + xMdragTot.toFixed(g_digits)+
			                             ', \t' + yMdragTot.toFixed(g_digits);	
}

function drawConstraints(type, translation_vector, scale_vector) {
	var vbo;
	if (!scale_vector) {
		scale_vector = [1.8, 1.8, 1.8];
	}
	switch (type) {
		case "cube":
			vbo = cubeContainerVBO;
			break;
	}
	vbo.switchToMe();
	vbo.adjust();
	vbo.draw(translation_vector, scale_vector);
}
function make3D(modelMatrix, u_ModelMatrix) {
	modelMatrix.setIdentity();
	var veyePos = eyePos.elements;
	var vlookAtPos = lookAtPos.elements;
	var vup = up.elements;
	modelMatrix.perspective(42.0,   // FOVY: top-to-bottom vertical image angle, in degrees
							aspect,   // Image Aspect Ratio: camera lens width/height
							near,   // camera z-near distance (always positive; frustum begins at z = -znear)
							far);  // camera z-far distance (always positive; frustum ends at z = -zfar)
	modelMatrix.lookAt( veyePos[0],     veyePos[1],     veyePos[2],    // Camera Position
						vlookAtPos[0],  vlookAtPos[1],  vlookAtPos[2],    // Position of object looking at
						vup[0],      vup[1],      vup[2]);
	modelMatrix.translate(0, 0, 1);
	gl.uniformMatrix4fv(u_ModelMatrix, false, modelMatrix.elements);
}

//============== CAMERA CONTROLS =====================//
var camVel = 0.15;
function moveeyePos(keyCode) {
	let axis_1 = lookAtPos.sub(eyePos);
	axis_1.normalize();
	axis_1 = axis_1.scalarMult(camVel);
	let axis_2 = up.cross(axis_1);
	axis_2.normalize();
	axis_2 = axis_2.scalarMult(camVel);
	///// WASD: Camera POSITION
	if (keyCode == "KeyW") {
		eyePos = eyePos.add(axis_1);
		lookAtPos = lookAtPos.add(axis_1);
	} else if (keyCode == "KeyS") {
		eyePos = eyePos.sub(axis_1);
		lookAtPos = lookAtPos.sub(axis_1);
	} else if (keyCode == "KeyA") {
		eyePos = eyePos.add(axis_2);
		lookAtPos = lookAtPos.add(axis_2);
	} else if (keyCode == "KeyD") {
		eyePos = eyePos.sub(axis_2);
		lookAtPos = lookAtPos.sub(axis_2);
	}
	console.log(eyePos.elements);
}

var cameraVerticalAngle = -16.7;  // Change this later to not be hard coded. This is starting tilt based on eyePos and lookAtPos
var cameraHorizontalAngle = 0;
// Source: http://learnwebgl.brown37.net/07_cameras/camera_rotating_motion.html
function tiltCamera(axis, angle) {
	let n = eyePos.sub(lookAtPos);
	n.normalize();
	let axis_1 = up.cross(n);
	axis_1.normalize();
	let center_p = lookAtPos.sub(eyePos);
	let rotation_matrix = new Matrix4();
	let tilt_axis
	if (axis == "horizontal") {
		tilt_axis = up.elements;
	} else {
		tilt_axis = axis_1.elements;
	}
	if (axis == "vertical" && Math.abs(cameraVerticalAngle + angle) >= 35) {
		return;
	} else if (axis == "vertical") {
		cameraVerticalAngle += angle;
	} else if (axis == "horizontal") {
		cameraHorizontalAngle += angle;
	}
	rotation_matrix.rotate(angle, tilt_axis[0], tilt_axis[1], tilt_axis[2]);
	center_p = rotation_matrix.multiplyVector3(center_p);
	lookAtPos = center_p.add(eyePos);
}

//===================Mouse and Keyboard event-handling Callbacks===============
//=============================================================================
function myMouseDown(ev) {
	var rect = ev.target.getBoundingClientRect();	// get canvas corners in pixels
	var xp = ev.clientX - rect.left;									  // x==0 at canvas left edge
	var yp = g_canvas.height - (ev.clientY - rect.top);	// y==0 at canvas bottom edge
	var x = (xp - g_canvas.width/2)  / 		// move origin to center of canvas and
							(g_canvas.width/2);			// normalize canvas to -1 <= x < +1,
	var y = (yp - g_canvas.height/2) /		//										 -1 <= y < +1.
							 (g_canvas.height/2);
	
	isDrag = true;											// set our mouse-dragging flag
	xMclik = x;													// record where mouse-dragging began
	yMclik = y;
	document.getElementById('MouseResult1').innerHTML = 
		'myMouseDown() at CVV coords x,y = '+x.toFixed(g_digits)+
										', '+y.toFixed(g_digits)+'<br>';
};

function myMouseMove(ev) {
	if(isDrag==false) return;				// IGNORE all mouse-moves except 'dragging'
	var rect = ev.target.getBoundingClientRect();	// get canvas corners in pixels
	var xp = ev.clientX - rect.left;									  // x==0 at canvas left edge
	var yp = g_canvas.height - (ev.clientY - rect.top);	// y==0 at canvas bottom edge
	var x = (xp - g_canvas.width/2)  / 		// move origin to center of canvas and
							(g_canvas.width/2);			// normalize canvas to -1 <= x < +1,
	var y = (yp - g_canvas.height/2) /		//										 -1 <= y < +1.
							 (g_canvas.height/2);
	xMdragTot += (x - xMclik);					// Accumulate change-in-mouse-position,&
	yMdragTot += (y - yMclik);
	xMclik = x;													// Make next drag-measurement from here.
	yMclik = y;
};

function myMouseUp(ev) {
// Create right-handed 'pixel' coords with origin at WebGL canvas LOWER left;
	var rect = ev.target.getBoundingClientRect();	// get canvas corners in pixels
	var xp = ev.clientX - rect.left;									  // x==0 at canvas left edge
	var yp = g_canvas.height - (ev.clientY - rect.top);	// y==0 at canvas bottom edge
	// Convert to Canonical View Volume (CVV) coordinates too:
	var x = (xp - g_canvas.width/2)  / 		// move origin to center of canvas and
							(g_canvas.width/2);			// normalize canvas to -1 <= x < +1,
	var y = (yp - g_canvas.height/2) /		//										 -1 <= y < +1.
							 (g_canvas.height/2);
	isDrag = false;											// CLEAR our mouse-dragging flag, and
	xMdragTot += (x - xMclik);
	yMdragTot += (y - yMclik);
	// Put it on our webpage too...
	document.getElementById('MouseResult1').innerHTML = 
	'myMouseUp() at CVV coords x,y = '+x+', '+y+'<br>';
};

function myMouseClick(ev) {
//=============================================================================
// Called when user completes a mouse-button single-click event 
// (e.g. mouse-button pressed down, then released)
// 									   
//    WHICH button? try:  console.log('ev.button='+ev.button); 
// 		ev.clientX, ev.clientY == mouse pointer location, but measured in webpage 
//		pixels: left-handed coords; UPPER left origin; Y increases DOWNWARDS (!) 
//    See myMouseUp(), myMouseDown() for conversions to  CVV coordinates.

  // STUB
//	console.log("myMouseClick() on button: ", ev.button); 
}	

function myMouseDblClick(ev) {
//=============================================================================
// Called when user completes a mouse-button double-click event 
// 									   
//    WHICH button? try:  console.log('ev.button='+ev.button); 
// 		ev.clientX, ev.clientY == mouse pointer location, but measured in webpage 
//		pixels: left-handed coords; UPPER left origin; Y increases DOWNWARDS (!) 
//    See myMouseUp(), myMouseDown() for conversions to  CVV coordinates.

  // STUB
//	console.log("myMouse-DOUBLE-Click() on button: ", ev.button); 
}

var currPartSysIdx = 3;
function changePartSysSelection(selectObject) {
    currPartSysIdx = selectObject.value;
}

function myKeyDown(kev) {
//============================================================================
// Called when user presses down ANY key on the keyboard;
//
// For a light, easy explanation of keyboard events in JavaScript,
// see:    http://www.kirupa.com/html5/keyboard_events_in_javascript.htm
// For a thorough explanation of a mess of JavaScript keyboard event handling,
// see:    http://javascript.info/tutorial/keyboard-events
//
// NOTE: Mozilla deprecated the 'keypress' event entirely, and in the
//        'keydown' event deprecated several read-only properties I used
//        previously, including kev.charCode, kev.keyCode. 
//        Revised 2/2019:  use kev.key and kev.code instead.
//
/*
	// On console, report EVERYTHING about this key-down event:  
  console.log("--kev.code:",      kev.code,   "\t\t--kev.key:",     kev.key, 
              "\n--kev.ctrlKey:", kev.ctrlKey,  "\t--kev.shiftKey:",kev.shiftKey,
              "\n--kev.altKey:",  kev.altKey,   "\t--kev.metaKey:", kev.metaKey);
*/
  // On webpage, report EVERYTING about this key-down event:              
	document.getElementById('KeyDown').innerHTML = ''; // clear old result
	document.getElementById('KeyMod').innerHTML = ''; 
	document.getElementById('KeyMod' ).innerHTML = 
			"   --kev.code:"+kev.code   +"      --kev.key:"+kev.key+
			"<br>--kev.ctrlKey:"+kev.ctrlKey+" --kev.shiftKey:"+kev.shiftKey+
			"<br> --kev.altKey:"+kev.altKey +"  --kev.metaKey:"+kev.metaKey;  

	// RESET our g_timeStep min/max recorder on every key-down event:
	g_timeStepMin = g_timeStep;
	g_timeStepMax = g_timeStep;

	let currPartSys = partSysArray[currPartSysIdx];
	switch(kev.code) {
		case "Digit0":
			currPartSys.runMode = 0;			// RESET!
			document.getElementById('KeyDown').innerHTML =  
					'myKeyDown() digit 0 key. Run Mode 0: RESET!';    // print on webpage,
			console.log("Run Mode 0: RESET!");                // print on console.
			break;
		case "Digit1":
			currPartSys.runMode = 1;			// PAUSE!
			document.getElementById('KeyDown').innerHTML =  
					'myKeyDown() digit 1 key. Run Mode 1: PAUSE!';    // print on webpage,
			console.log("Run Mode 1: PAUSE!");                // print on console.
			break;
		case "Digit2":
			currPartSys.runMode = 2;			// STEP!
			document.getElementById('KeyDown').innerHTML =  
					'myKeyDown() digit 2 key. Run Mode 2: STEP!';     // print on webpage,
			console.log("Run Mode 2: STEP!");                 // print on console.
			break;
		case "Digit3":
			currPartSys.runMode = 3;			// RESET!
			document.getElementById('KeyDown').innerHTML =  
					'myKeyDown() digit 3 key. Run Mode 3: RUN!';      // print on webpage,
			console.log("Run Mode 3: RUN!");                  // print on console.
			break;
		case "KeyB":                // Toggle floor-bounce constraint type
			if(currPartSys.bounceType==0) currPartSys.bounceType = 1;   // impulsive vs simple
			else currPartSys.bounceType = 0;
			document.getElementById('KeyDown').innerHTML =  
					'myKeyDown() b/B key: toggle bounce mode.';	      // print on webpage,
			console.log("b/B key: toggle bounce mode.");      // print on console. 
			break;
		case "KeyC":                // Toggle screen-clearing to show 'trails'
			g_isClear += 1;
			if(g_isClear > 1) g_isClear = 0;
			document.getElementById('KeyDown').innerHTML =  
					'myKeyDown() c/C key: toggle screen clear.';	 // print on webpage,
			console.log("c/C: toggle screen-clear g_isClear:",g_isClear); // print on console,
			break;
		case "KeyZ":      // 'd'  INCREASE drag loss; 'D' to DECREASE drag loss
			if(kev.shiftKey==false) currPartSys.drag *= 0.995; // permit less movement.
			else {
				currPartSys.drag *= 1.0 / 0.995;
				if(currPartSys.drag > 1.0) currPartSys.drag = 1.0;  // don't let drag ADD energy!
			}
			document.getElementById('KeyDown').innerHTML =  
					'myKeyDown() d/D key: grow/shrink drag.';	 // print on webpage,
			console.log("d/D: grow/shrink drag:", currPartSys.drag); // print on console,
			break;
		case "KeyG":    // 'g' to REDUCE gravity; 'G' to increase.
			if(kev.shiftKey==false) currPartSys.grav *= 0.99;		// shrink 1%
			else currPartSys.grav *= 1.0/0.99; // grow 1%
			document.getElementById('KeyDown').innerHTML =  
					'myKeyDown() g/G key: shrink/grow gravity.';	 			// print on webpage,
			console.log("g/G: shrink/grow gravity:", currPartSys.grav); 	// print on console,
			break;
		case "KeyP":
			if(currPartSys.runMode == 3) currPartSys.runMode = 1;		// if running, pause
								else currPartSys.runMode = 3;		          // if paused, run.
			document.getElementById('KeyDown').innerHTML =  
					'myKeyDown() p/P key: toggle Pause/unPause!';    // print on webpage
			console.log("p/P key: toggle Pause/unPause!");   			// print on console,
			break;
		case "KeyR":    // r/R for RESET: 
			if(kev.shiftKey==false) {   // 'r' key: SOFT reset; boost velocity only
				currPartSys.runMode = 3;  // RUN!
				var j=0; // array index for particle i
				for(var i = 0; i < currPartSys.partCount; i += 1, j+= PART_MAXVAR) {
					currPartSys.roundRand();  // make a spherical random var.
					if(  currPartSys.s2[j + PART_XVEL] > 0.0) // ADD to positive velocity, and 
							currPartSys.s2[j + PART_XVEL] += 1.7 + 0.4*currPartSys.randX*currPartSys.INIT_VEL;
															// SUBTRACT from negative velocity: 
					else currPartSys.s2[j + PART_XVEL] -= 1.7 + 0.4*currPartSys.randX*currPartSys.INIT_VEL; 

					if(  currPartSys.s2[j + PART_YVEL] > 0.0) 
							currPartSys.s2[j + PART_YVEL] += 1.7 + 0.4*currPartSys.randY*currPartSys.INIT_VEL; 
					else currPartSys.s2[j + PART_YVEL] -= 1.7 + 0.4*currPartSys.randY*currPartSys.INIT_VEL;

					if(  currPartSys.s2[j + PART_ZVEL] > 0.0) 
							currPartSys.s2[j + PART_ZVEL] += 1.7 + 0.4*currPartSys.randZ*currPartSys.INIT_VEL; 
					else currPartSys.s2[j + PART_ZVEL] -= 1.7 + 0.4*currPartSys.randZ*currPartSys.INIT_VEL;
				}
			}
			else {      // HARD reset: position AND velocity, BOTH state vectors:
				currPartSys.runMode = 0;			// RESET!
				// Reset state vector s1 for ALL particles:
				var j=0; // array index for particle i
				for(var i = 0; i < currPartSys.partCount; i += 1, j+= PART_MAXVAR) {
					currPartSys.roundRand();
					currPartSys.s2[j + PART_XPOS] =  -0.9;      // lower-left corner of CVV
					currPartSys.s2[j + PART_YPOS] =  -0.9;      // with a 0.1 margin
					currPartSys.s2[j + PART_ZPOS] =  0.0;	
					currPartSys.s2[j + PART_XVEL] =  3.7 + 0.4*currPartSys.randX*currPartSys.INIT_VEL;	
					currPartSys.s2[j + PART_YVEL] =  3.7 + 0.4*currPartSys.randY*currPartSys.INIT_VEL; // initial velocity in meters/sec.
					currPartSys.s2[j + PART_ZVEL] =  3.7 + 0.4*currPartSys.randZ*currPartSys.INIT_VEL;
					// do state-vector s2 as well: just copy all elements of the float32array.
					currPartSys.s2.set(currPartSys.s1);
				} // end for loop
			} // end HARD reset
			document.getElementById('KeyDown').innerHTML =  
			'myKeyDown() r/R key: soft/hard Reset.';	// print on webpage,
			console.log("r/R: soft/hard Reset");      // print on console,
			break;
		case "KeyF":
			if (currPartSys.solvType == SOLV_EULER) currPartSys.solvType = SOLV_MIDPOINT;  
			else if (currPartSys.solvType == SOLV_MIDPOINT) currPartSys.solvType = SOLV_ADAMS_BASH;
			else if (currPartSys.solvType == SOLV_ADAMS_BASH) currPartSys.solvType = SOLV_OLDGOOD;
			else if (currPartSys.solvType == SOLV_OLDGOOD) currPartSys.solvType = SOLV_VEL_VERLET;
			else if (currPartSys.solvType == SOLV_VEL_VERLET) currPartSys.solvType = SOLV_LEAPFROG;
			else if (currPartSys.solvType == SOLV_LEAPFROG) currPartSys.solvType = SOLV_BACK_EULER;
			else if (currPartSys.solvType == SOLV_BACK_EULER) currPartSys.solvType = SOLV_BACK_MIDPT;
			else currPartSys.solvType = SOLV_EULER;
			document.getElementById('KeyDown').innerHTML =  
			'myKeyDown() found s/S key. Switch solvers!';       // print on webpage.
		  	console.log("s/S: Change Solver:", currPartSys.solvType); // print on console.
			break;
		case "ArrowLeft":
			kev.preventDefault();
			tiltCamera("horizontal", 1);
			break;
		case "ArrowRight":
			kev.preventDefault();
			tiltCamera("horizontal", -1);
			break;
		case "ArrowUp":
			kev.preventDefault();
			tiltCamera("vertical", 1);
			break;
		case "ArrowDown":
			kev.preventDefault();
			tiltCamera("vertical", -1);
			break;
		// WASD NAVIGATION
		case "KeyW":
			console.log("w/W key: Move FWD!\n");
			moveeyePos("KeyW");
			break;
		case "KeyA":
			console.log("a/A key: Strafe LEFT!\n");
			moveeyePos("KeyA");
			break;
		case "KeyS":
			console.log("s/S key: Move BACK!\n");
			moveeyePos("KeyS");
			break;
		case "KeyD":
			console.log("d/D key: Strafe RIGHT!\n");
			moveeyePos("KeyD");
			break;

		case "KeyK":
			if(kev.shiftKey==false) {
				console.log("S1:");
				console.log(currPartSys.s1);
			} else {
				console.log("S2:")
				console.log(currPartSys.s2);
			}
			break
   		default:
			document.getElementById('KeyDown').innerHTML =
				'myKeyDown():UNUSED,keyCode='+kev.keyCode;
			console.log("UNUSED key:", kev.keyCode);
      		break;
  }
}

function myKeyUp(kev) {
//=============================================================================
// Called when user releases ANY key on the keyboard.
// Rarely needed -- most code needs only myKeyDown().
	console.log("myKeyUp():\n--kev.code:",kev.code,"\t\t--kev.key:", kev.key);
}

function printControls() {
	//==============================================================================
	// Print current state of the particle system on the webpage:
		let currPartSys = partSysArray[currPartSysIdx];
	
		var recipTime = 1000.0 / g_timeStep;			// to report fractional seconds
		var recipMin  = 1000.0 / g_timeStepMin;
		var recipMax  = 1000.0 / g_timeStepMax; 
		var solvTypeTxt;												// convert solver number to text:
		
		if(currPartSys.solvType==SOLV_EULER) solvTypeTxt = 'Explicit--Euler<br>';
		else if (currPartSys.solvType ==SOLV_MIDPOINT) solvTypeTxt = 'Implicit--Midpoint<br>'
		else if (currPartSys.solvType ==SOLV_ADAMS_BASH) solvTypeTxt = 'Implicit--AdamsBash<br>'
		else if (currPartSys.solvType == SOLV_OLDGOOD) solvTypeTxt = 'Implicit--Oldgood<br>'
		else if (currPartSys.solvType == SOLV_VEL_VERLET) solvTypeTxt = 'Semi-Implicit--Vel_Verlet<br>'
		else if (currPartSys.solvType == SOLV_BACK_EULER) solvTypeTxt = 'Implicit--Back_Euler<br>'
		else if (currPartSys.solvType == SOLV_BACK_MIDPT) solvTypeTxt = 'Implicit--Back_Midpoint<br>'
		else solvTypeTxt = 'Semi-Implicit--LeapFrog<br>'; 
	
		var bounceTypeTxt;											// convert bounce number to text
		if(currPartSys.bounceType==0) bounceTypeTxt = 'Velocity Reverse(no rest)<br>';
							 else bounceTypeTxt = 'Impulsive (will rest)<br>';
		var fountainText;
		if(currPartSys.isFountain==0) fountainText = 'OFF: ageless particles.<br>';
		else                      fountainText = 'ON: re-cycle old particles.<br>';
		var xvLimit = currPartSys.s2[PART_XVEL];	// find absolute values of s2[PART_XVEL]
		if(currPartSys.s2[PART_XVEL] < 0.0) xvLimit = -currPartSys.s2[PART_XVEL];
		var yvLimit = currPartSys.s2[PART_YVEL];	// find absolute values of s2[PART_YVEL]
		if(currPartSys.s2[PART_YVEL] < 0.0) yvLimit = -currPartSys.s2[PART_YVEL];
		
		document.getElementById('KeyControls').innerHTML = 
				   '<b>Solver = </b>' + solvTypeTxt + 
				   '<b>Bounce = </b>' + bounceTypeTxt +
				   '<b>drag = </b>' + currPartSys.drag.toFixed(5) + 
				   ', <b>grav = </b>' + currPartSys.grav.toFixed(5) +
				   ' m/s^2; <b>yVel = +/-</b> ' + yvLimit.toFixed(5) + 
				   ' m/s; <b>xVel = +/-</b> ' + xvLimit.toFixed(5) + 
				   ' m/s;<br><b>timeStep = </b> 1/' + recipTime.toFixed(3) + ' sec' +
								   ' <b>min:</b> 1/' + recipMin.toFixed(3)  + ' sec' + 
								   ' <b>max:</b> 1/' + recipMax.toFixed(3)  + ' sec<br>';
				   ' <b>stepCount: </b>' + g_stepCount.toFixed(3) ;
	}


function onPlusButton() {
//==============================================================================
	let currPartSys = partSysArray[currPartSysIdx];
	currPartSys.INIT_VEL *= 1.2;		// grow
	console.log('Initial velocity: '+currPartSys.INIT_VEL);
}

function onMinusButton() {
//==============================================================================
	let currPartSys = partSysArray[currPartSysIdx];
	currPartSys.INIT_VEL /= 1.2;		// shrink
	console.log('Initial velocity: '+currPartSys.INIT_VEL);
}

