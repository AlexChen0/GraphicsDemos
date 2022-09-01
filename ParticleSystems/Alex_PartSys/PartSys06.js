//3456789_123456789_123456789_123456789_123456789_123456789_123456789_123456789_
// (JT: why the numbers? counts columns, helps me keep 80-char-wide listings)

// Set 'tab' to 2 spaces (for best on-screen appearance)
/*
================================================================================
================================================================================

                              PartSys Library

================================================================================
================================================================================
Prototype object that contains one complete particle system, including:
 -- state-variables s1, s2, & more that each describe a complete set of 
  particles at a fixed instant in time. Each state-var is a Float32Array that 
  hold the parameters of this.targCount particles (defined by constructor).
 -- Each particle is an identical sequence of floating-point parameters defined 
  by the extensible set of array-index names defined as constants near the top 
  of this file.  For example: PART_XPOS for x-coordinate of position, PART_YPOS 
  for particle's y-coord, and finally PART_MAXVAL defines total # of parameters.
  To access parameter PART_YVEL of the 17th particle in state var s1, use:
  this.s1[PART_YVEL + 17*PART_MAXVAL].
 -- A collection of 'force-causing' objects in forceList array
                                                  (see CForcer prototype below),
 -- A collection of 'constraint-imposing' objects in limitList array
                                                  (see CLimit prototype below),
 -- Particle-system computing functions described in class notes: 
  init(), applyForces(), dotFinder(), render(), doConstraints(), swap().
 
 HOW TO USE:
 ---------------
 a) Be sure your WebGL rendering context is available as the global var 'gl'.
 b) Create a global variable for each independent particle system:
  e.g.    g_PartA = new PartSys(500);   // 500-particle fire-like system 
          g_partB = new PartSys(32);    //  32-particle spring-mass system
          g_partC = new PartSys(1024);  // 1024-particle smoke-like system
          ...
 c) Modify each particle-system as needed to get desired results:
    g_PartA.init(3);  g_PartA.solvType = SOLV_ADAMS_BASHFORTH; etc...
 d) Be sure your program's animation method (e.g. 'drawAll') calls the functions
    necessary for the simulation process of all particle systems, e.g.
      in main(), call g_partA.init(), g_partB.init(), g_partC.init(), ... etc
      in drawAll(), call:
        g_partA.applyForces(), g_partB.applyForces(), g_partC.applyForces(), ...
        g_partA.dotFinder(),   g_partB.dotFinder(),   g_partC.dotFinder(), ...
        g_partA.render(),      g_partB.render(),      g_partC.render(), ...
        g_partA.solver(),      g_partB.solver(),      g_partC.solver(), ...
        g_partA.doConstraint(),g_partB.doConstraint(),g_partC.doConstraint(),...
        g_partA.swap(),        g_partB.swap(),        g_partC.swap().

*/

// Array-name consts for all state-variables in PartSys object:
/*------------------------------------------------------------------------------
     Each state-variable is a Float32Array object that holds 'this.partCount' 
particles. For each particle the state var holds exactly PART_MAXVAR elements 
(aka the 'parameters' of the particle) arranged in the sequence given by these 
array-name consts below.  
     For example, the state-variable object 'this.s1' is a Float32Array that 
holds this.partCount particles, and each particle is described by a sequence of
PART_MAXVAR floating-point parameters; in other words, the 'stride' that moves
use from a given parameter in one particle to the same parameter in the next
particle is PART_MAXVAR. Suppose we wish to find the Y velocity parameter of 
particle number 17 in s1 ('first' particle is number 0): we can
get that value if we write: this.s1[PART_XVEL + 17*PART_MAXVAR].
------------------------------------------------------------------------------*/
const PART_XPOS     = 0;  //  position    
const PART_YPOS     = 1;
const PART_ZPOS     = 2;
const PART_WPOS     = 3;            // (why include w? for matrix transforms; 
                                    // for vector/point distinction
const PART_XVEL     = 4;  //  velocity -- ALWAYS a vector: x,y,z; no w. (w==0)    
const PART_YVEL     = 5;
const PART_ZVEL     = 6;
const PART_X_FTOT   = 7;  // force accumulator:'ApplyForces()' fcn clears
const PART_Y_FTOT   = 8;  // to zero, then adds each force to each particle.
const PART_Z_FTOT   = 9;        
const PART_R        =10;  // color : red,green,blue, alpha (opacity); 0<=RGBA<=1.0
const PART_G        =11;  
const PART_B        =12;
const PART_LIFELEFT =13;
const PART_MASS     =14;  	// mass, in kilograms
const PART_DIAM 	  =15;	// on-screen diameter (in pixels)
const PART_DIAM_INTERNAL = 16;
const PART_RENDMODE =17;	// on-screen appearance (square, round, or soft-round)
 // Other useful particle values, currently unused
const PART_AGE      =18;  // # of frame-times until re-initializing (Reeves Fire)
/*
const PART_CHARGE   =19;  // for electrostatic repulsion/attraction
const PART_MASS_VEL =18;  // time-rate-of-change of mass.
const PART_MASS_FTOT=19;  // force-accumulator for mass-change
const PART_R_VEL    =20;  // time-rate-of-change of color:red
const PART_G_VEL    =21;  // time-rate-of-change of color:grn
const PART_B_VEL    =22;  // time-rate-of-change of color:blu
const PART_R_FTOT   =23;  // force-accumulator for color-change: red
const PART_G_FTOT   =24;  // force-accumulator for color-change: grn
const PART_B_FTOT   =25;  // force-accumulator for color-change: blu
*/
const PART_MAXVAR   =19;  // Size of array in CPart uses to store its values.


// Array-Name consts that select PartSys objects' numerical-integration solver:
//------------------------------------------------------------------------------
// EXPLICIT methods: GOOD!
//    ++ simple, easy to understand, fast, but
//    -- Requires tiny time-steps for stable stiff systems, because
//    -- Errors tend to 'add energy' to any dynamical system, driving
//        many systems to instability even with small time-steps.
const SOLV_EULER       = 0;       // Euler integration: forward,explicit,...
const SOLV_MIDPOINT    = 1;       // Midpoint Method (see Pixar Tutorial)
const SOLV_ADAMS_BASH  = 2;       // Adams-Bashforth Explicit Integrator
const SOLV_RUNGEKUTTA  = 3;       // Arbitrary degree, set by 'solvDegree'

// IMPLICIT methods:  BETTER!
//          ++Permits larger time-steps for stiff systems, but
//          --More complicated, slower, less intuitively obvious,
//          ++Errors tend to 'remove energy' (ghost friction; 'damping') that
//              aids stability even for large time-steps.
//          --requires root-finding (iterative: often no analytical soln exists)
const SOLV_OLDGOOD     = 4;      //  early accidental 'good-but-wrong' solver
const SOLV_BACK_EULER  = 5;      // 'Backwind' or Implicit Euler
const SOLV_BACK_MIDPT  = 6;      // 'Backwind' or Implicit Midpoint
const SOLV_BACK_ADBASH = 7;      // 'Backwind' or Implicit Adams-Bashforth

// SEMI-IMPLICIT METHODS: BEST?
//          --Permits larger time-steps for stiff systems,
//          ++Simpler, easier-to-understand than Implicit methods
//          ++Errors tend to 'remove energy) (ghost friction; 'damping') that
//              aids stability even for large time-steps.
//          ++ DOES NOT require the root-finding of implicit methods,
const SOLV_VERLET      = 8;       // Verlet semi-implicit integrator;
const SOLV_VEL_VERLET  = 9;       // 'Velocity-Verlet'semi-implicit integrator
const SOLV_LEAPFROG    = 10;      // 'Leapfrog' integrator
const SOLV_MAX         = 11;      // number of solver types available.

const NU_EPSILON  = 10E-15;         // a tiny amount; a minimum vector length
                                    // to use to avoid 'divide-by-zero'

//=============================================================================
//==============================================================================
function PartSys() {
//==============================================================================
//=============================================================================
// Constructor for a new particle system.
  this.randX = 0;   // random point chosen by call to roundRand()
  this.randY = 0;
  this.randZ = 0;
  this.isFountain = 0;  // Press 'f' or 'F' key to toggle; if 1, apply age 
                        // age constraint, which re-initializes particles whose
                        // lifetime falls to zero, forming a 'fountain' of
                        // freshly re-initialized bouncy-balls.
  this.forceList = [];            // (empty) array to hold CForcer objects
                                  // for use by ApplyAllForces().
                                  // NOTE: this.forceList.push("hello"); appends
                                  // string "Hello" as last element of forceList.
                                  // console.log(this.forceList[0]); prints hello.
  this.limitList = [];            // (empty) array to hold CLimit objects
                                  // for use by doContstraints()
}
// HELPER FUNCTIONS:
//=====================
// Misc functions that don't fit elsewhere

PartSys.prototype.roundRand = function() {
//==============================================================================
// When called, find a new 3D point (this.randX, this.randY, this.randZ) chosen 
// 'randomly' and 'uniformly' inside a sphere of radius 1.0 centered at origin.  
//		(within this sphere, all regions of equal volume are equally likely to
//		contain the the point (randX, randY, randZ, 1).

	do {			// RECALL: Math.random() gives #s with uniform PDF between 0 and 1.
		this.randX = 2.0*Math.random() -1.0; // choose an equally-likely 2D point
		this.randY = 2.0*Math.random() -1.0; // within the +/-1 cube, but
		this.randZ = 2.0*Math.random() -1.0;
		}       // is x,y,z outside sphere? try again!
	while(this.randX*this.randX + 
	      this.randY*this.randY + 
	      this.randZ*this.randZ >= 1.0); 
}

// INIT FUNCTIONS:
//==================
// Each 'init' function initializes everything in our particle system. Each 
// creates all necessary state variables, force-applying objects, 
// constraint-applying objects, solvers and all other values needed to prepare
// the particle-system to run without any further adjustments.

PartSys.prototype.initBouncy2D = function(count) {
//==============================================================================
  // Create all state-variables-------------------------------------------------
  this.partCount = count;
  this.s0 =    new Float32Array(this.partCount * PART_MAXVAR);
  this.s1 =    new Float32Array(this.partCount * PART_MAXVAR);
  this.s2 =    new Float32Array(this.partCount * PART_MAXVAR);
  this.sM =    new Float32Array(this.partCount * PART_MAXVAR); 
  this.s1dot = new Float32Array(this.partCount * PART_MAXVAR);  
        // NOTE: Float32Array objects are zero-filled by default.

  // Create & init all force-causing objects------------------------------------
  var fTmp = new CForcer();       // create a force-causing object, and
  // earth gravity for all particles:
  fTmp.forceType = F_GRAV_E;      // set it to earth gravity, and
  fTmp.targFirst = 0;             // set it to affect ALL particles:
  fTmp.partCount = -1;            // (negative value means ALL particles)
  this.forceList.push(fTmp);      // append this 'gravity' force object to 
  // drag for all particles:
  fTmp = new CForcer();           // create a NEW CForcer object 
                                  // (WARNING! until we do this, fTmp refers to
                                  // the same memory locations as forceList[0]!!!) 
  fTmp.forceType = F_DRAG;        // Viscous Drag
  fTmp.K_drag = 0.15;              // in Euler solver, scales velocity by 0.85
  fTmp.targFirst = 0;             // apply it to ALL particles:
  fTmp.partCount = -1;            // (negative value means ALL particles)
                                  // (and IGNORE all other Cforcer members...)
  fTmp.e1 = this.s1.slice(0, PART_MAXVAR);
  fTmp.e2 = this.s1.slice(PART_MAXVAR, 34);
  this.forceList.push(fTmp);      // append this 'gravity' force object to 
  // the forceList array of force-causing objects.
  // Report:
  console.log("PartSys.initBouncy2D() created PartSys.forceList[] array of ");
  console.log("\t\t", this.forceList.length, "CForcer objects:");
  for(i=0; i<this.forceList.length; i++) {
    console.log("CForceList[",i,"]");
    this.forceList[i].printMe();
    }                   

  // Create & init all constraint-causing objects-------------------------------
  var cTmp = new CLimit();      // creat constraint-causing object, and
  cTmp.hitType = HIT_BOUNCE_VEL;  // set how particles 'bounce' from its surface,
  cTmp.limitType = LIM_VOL;       // confine particles inside axis-aligned 
                                  // rectangular volume that
  cTmp.targFirst = 0;             // applies to ALL particles; starting at 0 
  cTmp.partCount = -1;            // through all the rest of them.
  cTmp.xMin = -1.0; cTmp.xMax = 1.0;  // box extent:  +/- 1.0 box at origin
  cTmp.yMin = -1.0; cTmp.yMax = 1.0;
  cTmp.zMin = -1.0; cTmp.zMax = 1.0;
  cTmp.Kresti = 1.0;              // bouncyness: coeff. of restitution.
                                  // (and IGNORE all other CLimit members...)
  this.limitList.push(cTmp);      // append this 'box' constraint object to the
                                  // 'limitList' array of constraint-causing objects.                                
  // Report:
  console.log("PartSys.initBouncy2D() created PartSys.limitList[] array of ");
  console.log("\t\t", this.limitList.length, "CLimit objects.");

  this.INIT_VEL =  0.15 * 60.0;		// initial velocity in meters/sec.
	                  // adjust by ++Start, --Start buttons. Original value 
										// was 0.15 meters per timestep; multiply by 60 to get
                    // meters per second.
  this.drag = 0.98;// units-free air-drag (scales velocity); adjust by d/D keys
  this.grav = 9.832;// gravity's acceleration(meter/sec^2); adjust by g/G keys.
	                  // on Earth surface, value is 9.832 meters/sec^2.
  this.resti = 1.0;	
  //--------------------------init Particle System Controls:
  this.runMode =  3;// Master Control: 0=reset; 1= pause; 2=step; 3=run
  this.solvType = SOLV_OLDGOOD;// adjust by s/S keys.
                    // SOLV_EULER (explicit, forward-time, as 
										// found in BouncyBall03.01BAD and BouncyBall04.01badMKS)
										// SOLV_OLDGOOD for special-case implicit solver, reverse-time, 
										// as found in BouncyBall03.GOOD, BouncyBall04.goodMKS)
  this.bounceType = 1;	// floor-bounce constraint type:
										// ==0 for velocity-reversal, as in all previous versions
										// ==1 for Chapter 3's collision resolution method, which
										// uses an 'impulse' to cancel any velocity boost caused
										// by falling below the floor.
										
//--------------------------------Create & fill VBO with state var s1 contents:
// INITIALIZE s1, s2:
//  NOTE: s1,s2 are a Float32Array objects, zero-filled by default.
// That's OK for most particle parameters, but these need non-zero defaults:

  var j = 0;  // i==particle number; j==array index for i-th particle

  for(var i = 0; i < this.partCount; i += 1, j+= PART_MAXVAR) {
    this.roundRand();       // set this.randX,randY,randZ to random location in 
                            // a 3D unit sphere centered at the origin.
    //all our bouncy-balls stay within a +/- 0.9 cube centered at origin; 
    // set random positions in a 0.1-radius ball centered at (-0.8,-0.8,-0.8)
    this.s1[j + PART_XPOS] = -0.8 + 0.1*this.randX; 
    this.s1[j + PART_YPOS] = -0.8 + 0.1*this.randY;
    this.s1[j + PART_ZPOS] = -0.8 + 0.1*this.randZ;
    this.s1[j + PART_WPOS] =  1.0;      // position 'w' coordinate;
    this.roundRand(); // Now choose random initial velocities too:
    this.s1[j + PART_XVEL] = this.INIT_VEL*(0.4 + 0.2*this.randX);
    this.s1[j + PART_YVEL] = this.INIT_VEL*(0.4 + 0.2*this.randY);
    this.s1[j + PART_ZVEL] = this.INIT_VEL*(0.4 + 0.2*this.randZ);
    this.s1[j + PART_MASS] =  1.0;      // mass, in kg.
    this.s1[j + PART_DIAM] =  2.0 + 10*Math.random(); // on-screen diameter, in pixels
    this.s1[j + PART_LIFELEFT] = 10 + 10*Math.random();// 10 to 20
    this.s1[j + PART_RENDMODE] = 0.0;
    this.s1[j + PART_AGE] = 30 + 30*Math.random();
    this.s1[j + PART_R] = 1;
    this.s1[j + PART_G] = 1;
    this.s1[j + PART_B] = 1;
    //----------------------------
    this.s2.set(this.s1);   // COPY contents of state-vector s1 to s2.
    this.s0.set(this.s1);
    this.sM.set(this.s1);
  }

  this.FSIZE = this.s1.BYTES_PER_ELEMENT;  // 'float' size, in bytes.
// Create a vertex buffer object (VBO) in the graphics hardware: get its ID# 
  this.vboID = gl.createBuffer();
  if (!this.vboID) {
    console.log('PartSys.init() Failed to create the VBO object in the GPU');
    return -1;
  }
  // "Bind the new buffer object (memory in the graphics system) to target"
  // In other words, specify the usage of one selected buffer object.
  // What's a "Target"? it's the poorly-chosen OpenGL/WebGL name for the 
  // intended use of this buffer's memory; so far, we have just two choices:
  //	== "gl.ARRAY_BUFFER" meaning the buffer object holds actual values we 
  //      need for rendering (positions, colors, normals, etc), or 
  //	== "gl.ELEMENT_ARRAY_BUFFER" meaning the buffer object holds indices 
  // 			into a list of values we need; indices such as object #s, face #s, 
  //			edge vertex #s.
  gl.bindBuffer(gl.ARRAY_BUFFER, this.vboID);

  // Write data from our JavaScript array to graphics systems' buffer object:
  gl.bufferData(gl.ARRAY_BUFFER, this.s1, gl.DYNAMIC_DRAW);
  // why 'DYNAMIC_DRAW'? Because we change VBO's content with bufferSubData() later

  // ---------Set up all attributes for VBO contents:
  //Get the ID# for the a_Position variable in the graphics hardware
  this.a_PositionID = gl.getAttribLocation(gl.program, 'a_Position');
  if(this.a_PositionID < 0) {
    console.log('PartSys.init() Failed to get the storage location of a_Position');
    return -1;
  }
  // ---------Set up all attributes for VBO contents:
  //Get the ID# for the a_Position variable in the graphics hardware
  this.a_PositionID = gl.getAttribLocation(gl.program, 'a_Position');
  if(this.a_PositionID < 0) {
    console.log('PartSys.init() Failed to get the storage location of a_Position');
    return -1;
  }
  // Tell GLSL to fill the 'a_Position' attribute variable for each shader with
  // values from the buffer object chosen by 'gl.bindBuffer()' command.
  // websearch yields OpenGL version: 
  //		http://www.opengl.org/sdk/docs/man/xhtml/glVertexAttribPointer.xml
  gl.vertexAttribPointer(this.a_PositionID, 
          4,  // # of values in this attrib (1,2,3,4) 
          gl.FLOAT, // data type (usually gl.FLOAT)
          false,    // use integer normalizing? (usually false)
          PART_MAXVAR*this.FSIZE,  // Stride: #bytes from 1st stored value to next one
          PART_XPOS * this.FSIZE); // Offset; #bytes from start of buffer to 
                    // 1st stored attrib value we will actually use.
  // Enable this assignment of the bound buffer to the a_Position variable:
  gl.enableVertexAttribArray(this.a_PositionID);
  
  
  // --- NEW! particle 'age' attribute:--------------------------------
  //Get the ID# for the a_LifeLeft variable in the graphics hardware
  this.a_LifeLeftID = gl.getAttribLocation(gl.program, 'a_LifeLeft');
  if(this.a_LifeLeftID < 0) {
    console.log('PartSys.init() Failed to get the storage location of a_LifeLeft');
    return -1;
  }
  // Tell GLSL to fill the 'a_LifeSpan' attribute variable for each shader with
  // values from the buffer object chosen by 'gl.bindBuffer()' command.
  // websearch yields OpenGL version: 
  //		http://www.opengl.org/sdk/docs/man/xhtml/glVertexAttribPointer.xml
  gl.vertexAttribPointer(this.a_LifeLeftID, 
          1,  // # of values in this attrib (1,2,3,4) 
          gl.FLOAT, // data type (usually gl.FLOAT)
          false,    // use integer normalizing? (usually false)
          PART_MAXVAR*this.FSIZE,  // Stride: #bytes from 1st stored value to next one
          PART_LIFELEFT * this.FSIZE); // Offset; #bytes from start of buffer to 
                    // 1st stored attrib value we will actually use.
  // Enable this assignment of the bound buffer to the a_Position variable:
  gl.enableVertexAttribArray(this.a_LifeLeftID);

  this.a_AgeID = gl.getAttribLocation(gl.program, 'a_Age');
  if(this.a_AgeID < 0) {
    console.log('PartSys.init() Failed to get the storage location of a_Age');
    return -1;
  }
  // Tell GLSL to fill the 'a_LifeSpan' attribute variable for each shader with
  // values from the buffer object chosen by 'gl.bindBuffer()' command.
  // websearch yields OpenGL version: 
  //		http://www.opengl.org/sdk/docs/man/xhtml/glVertexAttribPointer.xml
  gl.vertexAttribPointer(this.a_AgeID, 
          1,  // # of values in this attrib (1,2,3,4) 
          gl.FLOAT, // data type (usually gl.FLOAT)
          false,    // use integer normalizing? (usually false)
          PART_MAXVAR*this.FSIZE,  // Stride: #bytes from 1st stored value to next one
          PART_AGE * this.FSIZE); // Offset; #bytes from start of buffer to 
                    // 1st stored attrib value we will actually use.
  // Enable this assignment of the bound buffer to the a_Position variable:
  gl.enableVertexAttribArray(this.a_AgeID);

  this.a_RGBLoc = gl.getAttribLocation(gl.program, 'a_RGB');
  if(this.a_RGBLoc < 0) {
    console.log('PartSys.init() Failed to get the storage location of a_RGB');
    return -1;
  }
  // Tell GLSL to fill the 'a_LifeSpan' attribute variable for each shader with
  // values from the buffer object chosen by 'gl.bindBuffer()' command.
  // websearch yields OpenGL version: 
  //		http://www.opengl.org/sdk/docs/man/xhtml/glVertexAttribPointer.xml
  gl.vertexAttribPointer(this.a_RGBLoc, 
          3,  // # of values in this attrib (1,2,3,4) 
          gl.FLOAT, // data type (usually gl.FLOAT)
          false,    // use integer normalizing? (usually false)
          PART_MAXVAR*this.FSIZE,  // Stride: #bytes from 1st stored value to next one
          PART_R * this.FSIZE); // Offset; #bytes from start of buffer to 
                    // 1st stored attrib value we will actually use.
  // Enable this assignment of the bound buffer to the a_Position variable:
  gl.enableVertexAttribArray(this.a_RGBLoc);

}

PartSys.prototype.initFireReeves = function(count) {
//==============================================================================
  // Create all state-variables-------------------------------------------------
  this.partCount = count;
  this.s0 =    new Float32Array(this.partCount * PART_MAXVAR);
  this.s1 =    new Float32Array(this.partCount * PART_MAXVAR);
  this.s2 =    new Float32Array(this.partCount * PART_MAXVAR);
  this.sM =    new Float32Array(this.partCount * PART_MAXVAR);
  this.s1dot = new Float32Array(this.partCount * PART_MAXVAR);
  this.isFountain = 1;
  this.constraintSize = 0.9;
  this.scaleSizeByDistance = 1;
        // NOTE: Float32Array objects are zero-filled by default.

  // Create & init all force-causing objects------------------------------------
  var fTmp = new CForcer();       // create a force-causing object, and
  fTmp = new CForcer();           // create a NEW CForcer object 
                                  // (WARNING! until we do this, fTmp refers to
                                  // the same memory locations as forceList[0]!!!) 
  fTmp.forceType = F_DRAG;        // Viscous Drag
  fTmp.K_drag = 0.5;              // in Euler solver, scales velocity by 0.85
  fTmp.targFirst = 0;             // apply it to ALL particles:
  fTmp.partCount = -1;            // (negative value means ALL particles)
                                  // (and IGNORE all other Cforcer members...)
  this.forceList.push(fTmp);      // append this 'gravity' force object to 

  // Create & init all constraint-causing objects-------------------------------
  var cTmp = new CLimit();      // creat constraint-causing object, and
  cTmp.hitType = HIT_BOUNCE_VEL;  // set how particles 'bounce' from its surface,
  cTmp.limitType = LIM_VOL;       // confine particles inside axis-aligned 
                                  // rectangular volume that
  cTmp.targFirst = 0;             // applies to ALL particles; starting at 0 
  cTmp.partCount = -1;            // through all the rest of them.
  cTmp.xMin = -1.0; cTmp.xMax = 1.0;  // box extent:  +/- 1.0 box at origin
  cTmp.yMin = -1.0; cTmp.yMax = 1.0;
  cTmp.zMin = -1.0; cTmp.zMax = 1.0;
  cTmp.Kresti = 1.0;              // bouncyness: coeff. of restitution.
                                  // (and IGNORE all other CLimit members...)
  this.limitList.push(cTmp);      // append this 'box' constraint object to the
                                  // 'limitList' array of constraint-causing objects.                                
  // Report:
  console.log("PartSys.initBouncy2D() created PartSys.limitList[] array of ");
  console.log("\t\t", this.limitList.length, "CLimit objects.");

  this.INIT_VEL =  0.15 * 60.0;		// initial velocity in meters/sec.
	                  // adjust by ++Start, --Start buttons. Original value 
										// was 0.15 meters per timestep; multiply by 60 to get
                    // meters per second.
  this.drag = 0.96;// units-free air-drag (scales velocity); adjust by d/D keys
  this.grav = 0;// gravity's acceleration(meter/sec^2); adjust by g/G keys.
	                  // on Earth surface, value is 9.832 meters/sec^2.
  this.resti = 1.0; // units-free 'Coefficient of Restitution' for 
	                  // inelastic collisions.  Sets the fraction of momentum 
										// (0.0 <= resti < 1.0) that remains after a ball 
										// 'bounces' on a wall or floor, as computed using 
										// velocity perpendicular to the surface. 
										// (Recall: momentum==mass*velocity.  If ball mass does 
										// not change, and the ball bounces off the x==0 wall,
										// its x velocity xvel will change to -xvel * resti ).
										
  //--------------------------init Particle System Controls:
  this.runMode =  3;// Master Control: 0=reset; 1= pause; 2=step; 3=run
  this.solvType = SOLV_OLDGOOD;// adjust by s/S keys.
                    // SOLV_EULER (explicit, forward-time, as 
										// found in BouncyBall03.01BAD and BouncyBall04.01badMKS)
										// SOLV_OLDGOOD for special-case implicit solver, reverse-time, 
										// as found in BouncyBall03.GOOD, BouncyBall04.goodMKS)
  this.bounceType = 1;	// floor-bounce constraint type:
										// ==0 for velocity-reversal, as in all previous versions
										// ==1 for Chapter 3's collision resolution method, which
										// uses an 'impulse' to cancel any velocity boost caused
										// by falling below the floor.
										
//--------------------------------Create & fill VBO with state var s1 contents:
// INITIALIZE s1, s2:
//  NOTE: s1,s2 are a Float32Array objects, zero-filled by default.
// That's OK for most particle parameters, but these need non-zero defaults:

  var j = 0;  // i==particle number; j==array index for i-th particle


  for(var i = 0; i < this.partCount; i += 1, j+= PART_MAXVAR) {
    this.roundRand();
    this.s1[j + PART_XPOS] = 0.0 + 0.2*this.randX; 
    this.s1[j + PART_YPOS] = 0.0 + 0.2*this.randY;  
    this.s1[j + PART_ZPOS] = -0.5 + 0.2*this.randZ;
    this.s1[j + PART_WPOS] =  1.0;      // position 'w' coordinate;
    this.roundRand(); // Now choose random initial velocities too:
    this.s1[j + PART_XVEL] =  this.INIT_VEL*(0.0 + 0.2*this.randX);
    this.s1[j + PART_YVEL] =  this.INIT_VEL*(0.0 + 0.2*this.randY);
    this.s1[j + PART_ZVEL] =  this.INIT_VEL*(0.5 + 0.2*this.randZ);
    this.s1[j + PART_MASS] = 1.0;      // mass, in kg.
    this.s1[j + PART_DIAM_INTERNAL] = 60 + 10*Math.random();
    this.s1[j + PART_DIAM] = this.calculateDistanceScale(this.s1, j);// on-screen diameter, in pixels
    this.s1[j + PART_LIFELEFT] = 1;// 10 to 20
    this.s1[j + PART_RENDMODE] = 0.0;
    this.s1[j + PART_AGE] = 1;
    this.s1[j + PART_R] = 1;
    this.s1[j + PART_G] = 1;
    this.s1[j + PART_B] = 1;
    //----------------------------
    this.s2.set(this.s1);   // COPY contents of state-vector s1 to s2.
    this.s0.set(this.s1);
    this.sM.set(this.s1);
  }

  this.FSIZE = this.s1.BYTES_PER_ELEMENT;  // 'float' size, in bytes.
// Create a vertex buffer object (VBO) in the graphics hardware: get its ID# 
  this.vboID = gl.createBuffer();
  if (!this.vboID) {
    console.log('PartSys.init() Failed to create the VBO object in the GPU');
    return -1;
  }
  // "Bind the new buffer object (memory in the graphics system) to target"
  // In other words, specify the usage of one selected buffer object.
  // What's a "Target"? it's the poorly-chosen OpenGL/WebGL name for the 
  // intended use of this buffer's memory; so far, we have just two choices:
  //	== "gl.ARRAY_BUFFER" meaning the buffer object holds actual values we 
  //      need for rendering (positions, colors, normals, etc), or 
  //	== "gl.ELEMENT_ARRAY_BUFFER" meaning the buffer object holds indices 
  // 			into a list of values we need; indices such as object #s, face #s, 
  //			edge vertex #s.
  gl.bindBuffer(gl.ARRAY_BUFFER, this.vboID);

  // Write data from our JavaScript array to graphics systems' buffer object:
  gl.bufferData(gl.ARRAY_BUFFER, this.s1, gl.DYNAMIC_DRAW);
  // why 'DYNAMIC_DRAW'? Because we change VBO's content with bufferSubData() later
// ---------Set up all attributes for VBO contents:
    //Get the ID# for the a_Position variable in the graphics hardware
    this.a_PositionID = gl.getAttribLocation(gl.program, 'a_Position');
    if(this.a_PositionID < 0) {
      console.log('PartSys.init() Failed to get the storage location of a_Position');
      return -1;
    }
    // Tell GLSL to fill the 'a_Position' attribute variable for each shader with
    // values from the buffer object chosen by 'gl.bindBuffer()' command.
    // websearch yields OpenGL version: 
    //		http://www.opengl.org/sdk/docs/man/xhtml/glVertexAttribPointer.xml
    gl.vertexAttribPointer(this.a_PositionID, 
            4,  // # of values in this attrib (1,2,3,4) 
            gl.FLOAT, // data type (usually gl.FLOAT)
            false,    // use integer normalizing? (usually false)
            PART_MAXVAR*this.FSIZE,  // Stride: #bytes from 1st stored value to next one
            PART_XPOS * this.FSIZE); // Offset; #bytes from start of buffer to 
                      // 1st stored attrib value we will actually use.
    // Enable this assignment of the bound buffer to the a_Position variable:
    gl.enableVertexAttribArray(this.a_PositionID);
    
    
    // --- NEW! particle 'age' attribute:--------------------------------
    //Get the ID# for the a_LifeLeft variable in the graphics hardware
    this.a_LifeLeftID = gl.getAttribLocation(gl.program, 'a_LifeLeft');
    if(this.a_LifeLeftID < 0) {
      console.log('PartSys.init() Failed to get the storage location of a_LifeLeft');
      return -1;
    }
    // Tell GLSL to fill the 'a_LifeSpan' attribute variable for each shader with
    // values from the buffer object chosen by 'gl.bindBuffer()' command.
    // websearch yields OpenGL version: 
    //		http://www.opengl.org/sdk/docs/man/xhtml/glVertexAttribPointer.xml
    gl.vertexAttribPointer(this.a_LifeLeftID, 
            1,  // # of values in this attrib (1,2,3,4) 
            gl.FLOAT, // data type (usually gl.FLOAT)
            false,    // use integer normalizing? (usually false)
            PART_MAXVAR*this.FSIZE,  // Stride: #bytes from 1st stored value to next one
            PART_LIFELEFT * this.FSIZE); // Offset; #bytes from start of buffer to 
                      // 1st stored attrib value we will actually use.
    // Enable this assignment of the bound buffer to the a_Position variable:
    gl.enableVertexAttribArray(this.a_LifeLeftID);
  
    this.a_AgeID = gl.getAttribLocation(gl.program, 'a_Age');
    if(this.a_AgeID < 0) {
      console.log('PartSys.init() Failed to get the storage location of a_Age');
      return -1;
    }
    // Tell GLSL to fill the 'a_LifeSpan' attribute variable for each shader with
    // values from the buffer object chosen by 'gl.bindBuffer()' command.
    // websearch yields OpenGL version: 
    //		http://www.opengl.org/sdk/docs/man/xhtml/glVertexAttribPointer.xml
    gl.vertexAttribPointer(this.a_AgeID, 
            1,  // # of values in this attrib (1,2,3,4) 
            gl.FLOAT, // data type (usually gl.FLOAT)
            false,    // use integer normalizing? (usually false)
            PART_MAXVAR*this.FSIZE,  // Stride: #bytes from 1st stored value to next one
            PART_AGE * this.FSIZE); // Offset; #bytes from start of buffer to 
                      // 1st stored attrib value we will actually use.
    // Enable this assignment of the bound buffer to the a_Position variable:
    gl.enableVertexAttribArray(this.a_AgeID);
  
    this.a_RGBLoc = gl.getAttribLocation(gl.program, 'a_RGB');
    if(this.a_RGBLoc < 0) {
      console.log('PartSys.init() Failed to get the storage location of a_RGB');
      return -1;
    }
    // Tell GLSL to fill the 'a_LifeSpan' attribute variable for each shader with
    // values from the buffer object chosen by 'gl.bindBuffer()' command.
    // websearch yields OpenGL version: 
    //		http://www.opengl.org/sdk/docs/man/xhtml/glVertexAttribPointer.xml
    gl.vertexAttribPointer(this.a_RGBLoc, 
            3,  // # of values in this attrib (1,2,3,4) 
            gl.FLOAT, // data type (usually gl.FLOAT)
            false,    // use integer normalizing? (usually false)
            PART_MAXVAR*this.FSIZE,  // Stride: #bytes from 1st stored value to next one
            PART_R * this.FSIZE); // Offset; #bytes from start of buffer to 
                      // 1st stored attrib value we will actually use.
    // Enable this assignment of the bound buffer to the a_Position variable:
    gl.enableVertexAttribArray(this.a_RGBLoc);

    this.a_DiameterLoc = gl.getAttribLocation(gl.program, 'a_Diameter');
    if(this.a_DiameterLoc < 0) {
      console.log('PartSys.init() Failed to get the storage location of a_Diameter');
      return -1;
    }

    gl.vertexAttribPointer(this.a_DiameterLoc, 
            1,  // # of values in this attrib (1,2,3,4) 
            gl.FLOAT, // data type (usually gl.FLOAT)
            false,    // use integer normalizing? (usually false)
            PART_MAXVAR*this.FSIZE,  // Stride: #bytes from 1st stored value to next one
            PART_DIAM * this.FSIZE); // Offset; #bytes from start of buffer to 
                      // 1st stored attrib value we will actually use.
    // Enable this assignment of the bound buffer to the a_Position variable:
    gl.enableVertexAttribArray(this.a_DiameterLoc);
}

PartSys.prototype.initTornado = function(count) { 
//==============================================================================
  console.log('PartSys.initTornado() stub not finished!');
}

PartSys.prototype.initFlocking = function(count) { 
//==============================================================================
  // Create all state-variables-------------------------------------------------
  this.partCount = count;
  this.s0 =    new Float32Array(this.partCount * PART_MAXVAR);
  this.s1 =    new Float32Array(this.partCount * PART_MAXVAR);
  this.s2 =    new Float32Array(this.partCount * PART_MAXVAR);
  this.sM =    new Float32Array(this.partCount * PART_MAXVAR); 
  this.s1dot = new Float32Array(this.partCount * PART_MAXVAR);  
  this.constraintSize = 2.7;
  this.scaleSizeByDistance = 1;
        // NOTE: Float32Array objects are zero-filled by default.

  // Create & init all force-causing objects------------------------------------
  var fTmp = new CForcer();    
  //add the 3 boids forces   
  fTmp.forceType = F_BOIDS1;      
  fTmp.targFirst = 0;             
  fTmp.partCount = -1;            
  this.forceList.push(fTmp);      
  fTmp = new CForcer();      
  fTmp.forceType = F_BOIDS2;     
  fTmp.targFirst = 0;   
  fTmp.partCount = -1;       
  this.forceList.push(fTmp);  
  fTmp = new CForcer();   
  fTmp.forceType = F_BOIDS3;    
  fTmp.targFirst = 0;          
  fTmp.partCount = -1;        
  this.forceList.push(fTmp);   
                  
  //drag force not needed in boids, but here to counteract the gain by forward calculating
  fTmp = new CForcer();  
  fTmp.forceType = F_DRAG;       
  fTmp.K_drag = 0.15;             
  fTmp.targFirst = 0;             
  fTmp.partCount = -1;            
  this.forceList.push(fTmp);      

  console.log("PartSys.initBouncy2D() created PartSys.forceList[] array of ");
  console.log("\t\t", this.forceList.length, "CForcer objects:");
  for(i=0; i<this.forceList.length; i++) {
    console.log("CForceList[",i,"]");
    this.forceList[i].printMe();
    }                   

  // Create & init all constraint-causing objects-------------------------------
  var cTmp = new CLimit();      // creat constraint-causing object, and
  cTmp.hitType = HIT_BOUNCE_VEL;  // set how particles 'bounce' from its surface,
  cTmp.limitType = LIM_VOL;       // confine particles inside axis-aligned 
                                  // rectangular volume that
  cTmp.targFirst = 0;             // applies to ALL particles; starting at 0 
  cTmp.partCount = -1;            // through all the rest of them.
  cTmp.xMin = -1.0; cTmp.xMax = 1.0;  // box extent:  +/- 1.0 box at origin
  cTmp.yMin = -1.0; cTmp.yMax = 1.0;
  cTmp.zMin = -1.0; cTmp.zMax = 1.0;
  cTmp.Kresti = 1.0;              // bouncyness: coeff. of restitution.
                                  // (and IGNORE all other CLimit members...)
  this.limitList.push(cTmp);      // append this 'box' constraint object to the
                                  // 'limitList' array of constraint-causing objects.                                
  // Report:
  console.log("PartSys.initBouncy2D() created PartSys.limitList[] array of ");
  console.log("\t\t", this.limitList.length, "CLimit objects.");

  this.INIT_VEL =  0.15 * 60.0;		// initial velocity in meters/sec.
                    // adjust by ++Start, --Start buttons. Original value 
                    // was 0.15 meters per timestep; multiply by 60 to get
                    // meters per second.
  this.drag = 0.995;// units-free air-drag (scales velocity); adjust by d/D keys
  this.grav = 9.832;// gravity's acceleration(meter/sec^2); adjust by g/G keys.
                    // on Earth surface, value is 9.832 meters/sec^2.
  this.resti = 1.0; // units-free 'Coefficient of Restitution' for 
                    // inelastic collisions.  Sets the fraction of momentum 
                    // (0.0 <= resti < 1.0) that remains after a ball 
                    // 'bounces' on a wall or floor, as computed using 
                    // velocity perpendicular to the surface. 
                    // (Recall: momentum==mass*velocity.  If ball mass does 
                    // not change, and the ball bounces off the x==0 wall,
                    // its x velocity xvel will change to -xvel * resti ).
                    
  //--------------------------init Particle System Controls:
  this.runMode =  3;// Master Control: 0=reset; 1= pause; 2=step; 3=run
  this.solvType = SOLV_OLDGOOD;// adjust by s/S keys.
                    // SOLV_EULER (explicit, forward-time, as 
                    // found in BouncyBall03.01BAD and BouncyBall04.01badMKS)
                    // SOLV_OLDGOOD for special-case implicit solver, reverse-time, 
                    // as found in BouncyBall03.GOOD, BouncyBall04.goodMKS)
  this.bounceType = 1;	// floor-bounce constraint type:
                    // ==0 for velocity-reversal, as in all previous versions
                    // ==1 for Chapter 3's collision resolution method, which
                    // uses an 'impulse' to cancel any velocity boost caused
                    // by falling below the floor.
                    
//--------------------------------Create & fill VBO with state var s1 contents:
// INITIALIZE s1, s2:
//  NOTE: s1,s2 are a Float32Array objects, zero-filled by default.
// That's OK for most particle parameters, but these need non-zero defaults:

  var j = 0;  // i==particle number; j==array index for i-th particle

  for(var i = 0; i < this.partCount; i += 1, j+= PART_MAXVAR) {
    this.roundRand();       // set this.randX,randY,randZ to random location in 
                            // a 3D unit sphere centered at the origin.
    //all our bouncy-balls stay within a +/- 0.9 cube centered at origin; 
    // set random positions in a 0.1-radius ball centered at (-0.8,-0.8,-0.8)
    this.s1[j + PART_XPOS] = -0.8 + 0.1*this.randX; 
    this.s1[j + PART_YPOS] = -0.8 + 0.1*this.randY;
    this.s1[j + PART_ZPOS] = -0.8 + 0.1*this.randZ;
    this.s1[j + PART_WPOS] =  1.0;      // position 'w' coordinate;
    this.roundRand(); // Now choose random initial velocities too:
    this.s1[j + PART_XVEL] = this.INIT_VEL*(0.4 + 0.2*this.randX);
    this.s1[j + PART_YVEL] = this.INIT_VEL*(0.4 + 0.2*this.randY);
    this.s1[j + PART_ZVEL] = this.INIT_VEL*(0.4 + 0.2*this.randZ);
    this.s1[j + PART_MASS] =  1.0;      // mass, in kg.
    this.s1[j + PART_DIAM_INTERNAL] = 80.0 + 80*Math.random();
    this.s1[j + PART_DIAM] = 5.0; // on-screen diameter, in pixels
    this.s1[j + PART_LIFELEFT] = 10 + 10*Math.random();// 10 to 20
    this.s1[j + PART_RENDMODE] = 0.0;
    this.s1[j + PART_AGE] = 30 + 30*Math.random();
    this.s1[j + PART_R] = this.randX;
    this.s1[j + PART_G] = this.randY;
    this.s1[j + PART_B] = 1;
    //----------------------------
    this.s2.set(this.s1);   // COPY contents of state-vector s1 to s2.
    this.s0.set(this.s1);
    this.sM.set(this.s1);
  }

  this.FSIZE = this.s1.BYTES_PER_ELEMENT;  // 'float' size, in bytes.
// Create a vertex buffer object (VBO) in the graphics hardware: get its ID# 
  this.vboID = gl.createBuffer();
  if (!this.vboID) {
    console.log('PartSys.init() Failed to create the VBO object in the GPU');
    return -1;
  }
  // "Bind the new buffer object (memory in the graphics system) to target"
  // In other words, specify the usage of one selected buffer object.
  // What's a "Target"? it's the poorly-chosen OpenGL/WebGL name for the 
  // intended use of this buffer's memory; so far, we have just two choices:
  //	== "gl.ARRAY_BUFFER" meaning the buffer object holds actual values we 
  //      need for rendering (positions, colors, normals, etc), or 
  //	== "gl.ELEMENT_ARRAY_BUFFER" meaning the buffer object holds indices 
  // 			into a list of values we need; indices such as object #s, face #s, 
  //			edge vertex #s.
  gl.bindBuffer(gl.ARRAY_BUFFER, this.vboID);

  // Write data from our JavaScript array to graphics systems' buffer object:
  gl.bufferData(gl.ARRAY_BUFFER, this.s1, gl.DYNAMIC_DRAW);
  // why 'DYNAMIC_DRAW'? Because we change VBO's content with bufferSubData() later

  // ---------Set up all attributes for VBO contents:
  //Get the ID# for the a_Position variable in the graphics hardware
// ---------Set up all attributes for VBO contents:
  //Get the ID# for the a_Position variable in the graphics hardware
  this.a_PositionID = gl.getAttribLocation(gl.program, 'a_Position');
  if(this.a_PositionID < 0) {
    console.log('PartSys.init() Failed to get the storage location of a_Position');
    return -1;
  }
  // Tell GLSL to fill the 'a_Position' attribute variable for each shader with
  // values from the buffer object chosen by 'gl.bindBuffer()' command.
  // websearch yields OpenGL version: 
  //		http://www.opengl.org/sdk/docs/man/xhtml/glVertexAttribPointer.xml
  gl.vertexAttribPointer(this.a_PositionID, 
          4,  // # of values in this attrib (1,2,3,4) 
          gl.FLOAT, // data type (usually gl.FLOAT)
          false,    // use integer normalizing? (usually false)
          PART_MAXVAR*this.FSIZE,  // Stride: #bytes from 1st stored value to next one
          PART_XPOS * this.FSIZE); // Offset; #bytes from start of buffer to 
                    // 1st stored attrib value we will actually use.
  // Enable this assignment of the bound buffer to the a_Position variable:
  gl.enableVertexAttribArray(this.a_PositionID);
  
  
  // --- NEW! particle 'age' attribute:--------------------------------
  //Get the ID# for the a_LifeLeft variable in the graphics hardware
  this.a_LifeLeftID = gl.getAttribLocation(gl.program, 'a_LifeLeft');
  if(this.a_LifeLeftID < 0) {
    console.log('PartSys.init() Failed to get the storage location of a_LifeLeft');
    return -1;
  }
  // Tell GLSL to fill the 'a_LifeSpan' attribute variable for each shader with
  // values from the buffer object chosen by 'gl.bindBuffer()' command.
  // websearch yields OpenGL version: 
  //		http://www.opengl.org/sdk/docs/man/xhtml/glVertexAttribPointer.xml
  gl.vertexAttribPointer(this.a_LifeLeftID, 
          1,  // # of values in this attrib (1,2,3,4) 
          gl.FLOAT, // data type (usually gl.FLOAT)
          false,    // use integer normalizing? (usually false)
          PART_MAXVAR*this.FSIZE,  // Stride: #bytes from 1st stored value to next one
          PART_LIFELEFT * this.FSIZE); // Offset; #bytes from start of buffer to 
                    // 1st stored attrib value we will actually use.
  // Enable this assignment of the bound buffer to the a_Position variable:
  gl.enableVertexAttribArray(this.a_LifeLeftID);

  this.a_AgeID = gl.getAttribLocation(gl.program, 'a_Age');
  if(this.a_AgeID < 0) {
    console.log('PartSys.init() Failed to get the storage location of a_Age');
    return -1;
  }
  // Tell GLSL to fill the 'a_LifeSpan' attribute variable for each shader with
  // values from the buffer object chosen by 'gl.bindBuffer()' command.
  // websearch yields OpenGL version: 
  //		http://www.opengl.org/sdk/docs/man/xhtml/glVertexAttribPointer.xml
  gl.vertexAttribPointer(this.a_AgeID, 
          1,  // # of values in this attrib (1,2,3,4) 
          gl.FLOAT, // data type (usually gl.FLOAT)
          false,    // use integer normalizing? (usually false)
          PART_MAXVAR*this.FSIZE,  // Stride: #bytes from 1st stored value to next one
          PART_AGE * this.FSIZE); // Offset; #bytes from start of buffer to 
                    // 1st stored attrib value we will actually use.
  // Enable this assignment of the bound buffer to the a_Position variable:
  gl.enableVertexAttribArray(this.a_AgeID);

  this.a_RGBLoc = gl.getAttribLocation(gl.program, 'a_RGB');
  if(this.a_RGBLoc < 0) {
    console.log('PartSys.init() Failed to get the storage location of a_RGB');
    return -1;
  }
  // Tell GLSL to fill the 'a_LifeSpan' attribute variable for each shader with
  // values from the buffer object chosen by 'gl.bindBuffer()' command.
  // websearch yields OpenGL version: 
  //		http://www.opengl.org/sdk/docs/man/xhtml/glVertexAttribPointer.xml
  gl.vertexAttribPointer(this.a_RGBLoc, 
          3,  // # of values in this attrib (1,2,3,4) 
          gl.FLOAT, // data type (usually gl.FLOAT)
          false,    // use integer normalizing? (usually false)
          PART_MAXVAR*this.FSIZE,  // Stride: #bytes from 1st stored value to next one
          PART_R * this.FSIZE); // Offset; #bytes from start of buffer to 
                    // 1st stored attrib value we will actually use.
  // Enable this assignment of the bound buffer to the a_Position variable:
  gl.enableVertexAttribArray(this.a_RGBLoc);

  this.a_DiameterLoc = gl.getAttribLocation(gl.program, 'a_Diameter');
  if(this.a_DiameterLoc < 0) {
    console.log('PartSys.init() Failed to get the storage location of a_Diameter');
    return -1;
  }

  gl.vertexAttribPointer(this.a_DiameterLoc, 
          1,  // # of values in this attrib (1,2,3,4) 
          gl.FLOAT, // data type (usually gl.FLOAT)
          false,    // use integer normalizing? (usually false)
          PART_MAXVAR*this.FSIZE,  // Stride: #bytes from 1st stored value to next one
          PART_DIAM * this.FSIZE); // Offset; #bytes from start of buffer to 
                    // 1st stored attrib value we will actually use.
  // Enable this assignment of the bound buffer to the a_Position variable:
  gl.enableVertexAttribArray(this.a_DiameterLoc);
}

PartSys.prototype.initSpringPair = function() { 
//==============================================================================
  console.log('PartSys.initSpringPair() stub not finished!');
}

PartSys.prototype.initSpringRope = function(count) { 
  this.partCount = count;
  this.s0 =    new Float32Array(this.partCount * PART_MAXVAR);
  this.s1 =    new Float32Array(this.partCount * PART_MAXVAR);
  this.s2 =    new Float32Array(this.partCount * PART_MAXVAR);
  this.sM =    new Float32Array(this.partCount * PART_MAXVAR);
  this.s1dot = new Float32Array(this.partCount * PART_MAXVAR);  
  this.constraintSize = 0.9;
  // Create & init all force-causing objects------------------------------------
  var fTmp = new CForcer();       // create a force-causing object, and
  // earth gravity for all particles:
  fTmp.forceType = F_GRAV_E;      // set it to earth gravity, and
  fTmp.targFirst = 0;             // set it to affect ALL particles:
  fTmp.partCount = -1;            // (negative value means ALL particles)
  this.forceList.push(fTmp);      // append this 'gravity' force object to 

  // Spring force for all particles
  var fTmp = new CForcer();       // create a force-causing object, and
  fTmp.forceType = F_SPRING;      // set to spring thingy
  fTmp.targFirst = 0;             // set it to affect ALL particles:d
  fTmp.partCount = -1;            // (negative value means ALL particles)
  fTmp.K_spring = 4000.0;
  fTmp.K_springDamp = .98;
  fTmp.K_restLength = 0.01; 
  this.forceList.push(fTmp);      // append this 'gravity' force object to 

  var fTmp = new CForcer();  //add wind
  fTmp.forceType = F_WIND;    
  fTmp.targFirst = 0;           
  fTmp.partCount = -1;            
  this.forceList.push(fTmp);      

  // Drag for all particles:
  fTmp = new CForcer();           // create a NEW CForcer object 
  fTmp.forceType = F_DRAG;        // Viscous Drag
  fTmp.K_drag = 0.5;              // in Euler solver, scales velocity by 0.85
  fTmp.targFirst = 0;             // apply it to ALL particles:
  fTmp.partCount = -1;            // (negative value means ALL particles)
  this.forceList.push(fTmp);      // append this 'gravity' force object to 

  console.log("PartSys.initBouncy2D() created PartSys.forceList[] array of ");
  console.log("\t\t", this.forceList.length, "CForcer objects:");
  for(i=0; i<this.forceList.length; i++) {
    console.log("CForceList[",i,"]");
    this.forceList[i].printMe();
  }                   

  // Create & init all constraint-causing objects-------------------------------
  var cTmp = new CLimit();      // creat constraint-causing object, and
  cTmp.hitType = HIT_BOUNCE_VEL;  // set how particles 'bounce' from its surface,
  cTmp.limitType = LIM_VOL;       // confine particles inside axis-aligned 
  cTmp.targFirst = 0;             // applies to ALL particles; starting at 0 
  cTmp.partCount = -1;            // through all the rest of them.
  cTmp.xMin = -1.0; cTmp.xMax = 1.0;  // box extent:  +/- 1.0 box at origin
  cTmp.yMin = -1.0; cTmp.yMax = 1.0;
  cTmp.zMin = -1.0; cTmp.zMax = 1.0;
  cTmp.Kresti = 1.0;              // bouncyness: coeff. of restitution.
  this.limitList.push(cTmp);      // append this 'box' constraint object to the

  // Report:
  console.log("PartSys.initBouncy2D() created PartSys.limitList[] array of ");
  console.log("\t\t", this.limitList.length, "CLimit objects.");

  this.INIT_VEL =  0.15 * 60.0;		// initial velocity in meters/sec.
  this.drag = 0.98;// units-free air-drag (scales velocity); adjust by d/D keys
  this.grav = 9.832;// gravity's acceleration(meter/sec^2); adjust by g/G keys.
  this.resti = 0.4; // units-free 'Coefficient of Restitution' for 
  //--------------------------init Particle System Controls:
  this.runMode =  3;// Master Control: 0=reset; 1= pause; 2=step; 3=run
  this.solvType = SOLV_OLDGOOD;// adjust by s/S keys.
  this.bounceType = 1;	// floor-bounce constraint type:
										
  //--------------------------------Create & fill VBO with state var s1 contents:
  let prevPos = [0.0, 0.0, 0.8];
  var j = 0;  // i==particle number; j==array index for i-th particle
  for(var i = 0; i < this.partCount; i += 1, j+= PART_MAXVAR) {
    this.roundRand();       // set this.randX,randY,randZ to random location in 
    this.s1[j + PART_XPOS] = prevPos[0] + 0.01; 
    this.s1[j + PART_YPOS] = prevPos[1] + 0.01;
    this.s1[j + PART_ZPOS] = prevPos[2] - 0.05;
    prevPos[0] = this.s1[j + PART_XPOS]
    prevPos[1] = this.s1[j + PART_YPOS]
    prevPos[2] = this.s1[j + PART_ZPOS]
    this.s1[j + PART_WPOS] =  1.0;      // position 'w' coordinate;
    this.roundRand(); // Now choose random initial velocities too:
    this.s1[j + PART_XVEL] = 0;
    this.s1[j + PART_YVEL] = 0;
    this.s1[j + PART_ZVEL] = 0;
    this.s1[j + PART_MASS] =  1.0;      // mass, in kg.
    this.s1[j + PART_DIAM_INTERNAL] = 120;
    this.s1[j + PART_DIAM] =  this.calculateDistanceScale(this.s1, j); // on-screen diameter, in pixels
    this.s1[j + PART_LIFELEFT] = 10 + 10*Math.random();// 10 to 20
    this.s1[j + PART_RENDMODE] = 0.0;
    this.s1[j + PART_AGE] = 30 + 30*Math.random();
    this.s1[j + PART_R] = 1;
    this.s1[j + PART_G] = 0;
    this.s1[j + PART_B] = 1;
    this.s2.set(this.s1);   // COPY contents of state-vector s1 to s2.
    this.s0.set(this.s1);
    this.sM.set(this.s1);
  }

  this.FSIZE = this.s1.BYTES_PER_ELEMENT;  // 'float' size, in bytes.
  this.vboID = gl.createBuffer();
  if (!this.vboID) {
    console.log('PartSys.init() Failed to create the VBO object in the GPU');
    return -1;
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, this.vboID);

  // Write data from our JavaScript array to graphics systems' buffer object:
  gl.bufferData(gl.ARRAY_BUFFER, this.s1, gl.DYNAMIC_DRAW);

  // ---------Set up all attributes for VBO contents:
  //Get the ID# for the a_Position variable in the graphics hardware
  this.a_PositionID = gl.getAttribLocation(gl.program, 'a_Position');
  if(this.a_PositionID < 0) {
    console.log('PartSys.init() Failed to get the storage location of a_Position');
    return -1;
  }
// ---------Set up all attributes for VBO contents:
    //Get the ID# for the a_Position variable in the graphics hardware
    this.a_PositionID = gl.getAttribLocation(gl.program, 'a_Position');
    if(this.a_PositionID < 0) {
      console.log('PartSys.init() Failed to get the storage location of a_Position');
      return -1;
    }
    // Tell GLSL to fill the 'a_Position' attribute variable for each shader with
    // values from the buffer object chosen by 'gl.bindBuffer()' command.
    // websearch yields OpenGL version: 
    //		http://www.opengl.org/sdk/docs/man/xhtml/glVertexAttribPointer.xml
    gl.vertexAttribPointer(this.a_PositionID, 
            4,  // # of values in this attrib (1,2,3,4) 
            gl.FLOAT, // data type (usually gl.FLOAT)
            false,    // use integer normalizing? (usually false)
            PART_MAXVAR*this.FSIZE,  // Stride: #bytes from 1st stored value to next one
            PART_XPOS * this.FSIZE); // Offset; #bytes from start of buffer to 
                      // 1st stored attrib value we will actually use.
    // Enable this assignment of the bound buffer to the a_Position variable:
    gl.enableVertexAttribArray(this.a_PositionID);
    
    
    // --- NEW! particle 'age' attribute:--------------------------------
    //Get the ID# for the a_LifeLeft variable in the graphics hardware
    this.a_LifeLeftID = gl.getAttribLocation(gl.program, 'a_LifeLeft');
    if(this.a_LifeLeftID < 0) {
      console.log('PartSys.init() Failed to get the storage location of a_LifeLeft');
      return -1;
    }
    // Tell GLSL to fill the 'a_LifeSpan' attribute variable for each shader with
    // values from the buffer object chosen by 'gl.bindBuffer()' command.
    // websearch yields OpenGL version: 
    //		http://www.opengl.org/sdk/docs/man/xhtml/glVertexAttribPointer.xml
    gl.vertexAttribPointer(this.a_LifeLeftID, 
            1,  // # of values in this attrib (1,2,3,4) 
            gl.FLOAT, // data type (usually gl.FLOAT)
            false,    // use integer normalizing? (usually false)
            PART_MAXVAR*this.FSIZE,  // Stride: #bytes from 1st stored value to next one
            PART_LIFELEFT * this.FSIZE); // Offset; #bytes from start of buffer to 
                      // 1st stored attrib value we will actually use.
    // Enable this assignment of the bound buffer to the a_Position variable:
    gl.enableVertexAttribArray(this.a_LifeLeftID);
  
    this.a_AgeID = gl.getAttribLocation(gl.program, 'a_Age');
    if(this.a_AgeID < 0) {
      console.log('PartSys.init() Failed to get the storage location of a_Age');
      return -1;
    }
    // Tell GLSL to fill the 'a_LifeSpan' attribute variable for each shader with
    // values from the buffer object chosen by 'gl.bindBuffer()' command.
    // websearch yields OpenGL version: 
    //		http://www.opengl.org/sdk/docs/man/xhtml/glVertexAttribPointer.xml
    gl.vertexAttribPointer(this.a_AgeID, 
            1,  // # of values in this attrib (1,2,3,4) 
            gl.FLOAT, // data type (usually gl.FLOAT)
            false,    // use integer normalizing? (usually false)
            PART_MAXVAR*this.FSIZE,  // Stride: #bytes from 1st stored value to next one
            PART_AGE * this.FSIZE); // Offset; #bytes from start of buffer to 
                      // 1st stored attrib value we will actually use.
    // Enable this assignment of the bound buffer to the a_Position variable:
    gl.enableVertexAttribArray(this.a_AgeID);
  
    this.a_RGBLoc = gl.getAttribLocation(gl.program, 'a_RGB');
    if(this.a_RGBLoc < 0) {
      console.log('PartSys.init() Failed to get the storage location of a_RGB');
      return -1;
    }
    // Tell GLSL to fill the 'a_LifeSpan' attribute variable for each shader with
    // values from the buffer object chosen by 'gl.bindBuffer()' command.
    // websearch yields OpenGL version: 
    //		http://www.opengl.org/sdk/docs/man/xhtml/glVertexAttribPointer.xml
    gl.vertexAttribPointer(this.a_RGBLoc, 
            3,  // # of values in this attrib (1,2,3,4) 
            gl.FLOAT, // data type (usually gl.FLOAT)
            false,    // use integer normalizing? (usually false)
            PART_MAXVAR*this.FSIZE,  // Stride: #bytes from 1st stored value to next one
            PART_R * this.FSIZE); // Offset; #bytes from start of buffer to 
                      // 1st stored attrib value we will actually use.
    // Enable this assignment of the bound buffer to the a_Position variable:
    gl.enableVertexAttribArray(this.a_RGBLoc);

    this.a_DiameterLoc = gl.getAttribLocation(gl.program, 'a_Diameter');
    if(this.a_DiameterLoc < 0) {
      console.log('PartSys.init() Failed to get the storage location of a_Diameter');
      return -1;
    }

    gl.vertexAttribPointer(this.a_DiameterLoc, 
            1,  // # of values in this attrib (1,2,3,4) 
            gl.FLOAT, // data type (usually gl.FLOAT)
            false,    // use integer normalizing? (usually false)
            PART_MAXVAR*this.FSIZE,  // Stride: #bytes from 1st stored value to next one
            PART_DIAM * this.FSIZE); // Offset; #bytes from start of buffer to 
                      // 1st stored attrib value we will actually use.
    // Enable this assignment of the bound buffer to the a_Position variable:
    gl.enableVertexAttribArray(this.a_DiameterLoc);
}

PartSys.prototype.initSpringCloth = function(xSiz,ySiz) {
//==============================================================================
  console.log('PartSys.initSpringCloth() stub not finished!');
}

PartSys.prototype.initSpringSolid = function() {
//==============================================================================
  console.log('PartSys.initSpringSolid() stub not finished!');
}

PartSys.prototype.initOrbits = function(count) { 
  //==============================================================================
    //==============================================================================
    // Create all state-variables-------------------------------------------------
    this.partCount = count;
    this.s0 =    new Float32Array(this.partCount * PART_MAXVAR);
    this.s1 =    new Float32Array(this.partCount * PART_MAXVAR);
    this.s2 =    new Float32Array(this.partCount * PART_MAXVAR);
    this.sM =    new Float32Array(this.partCount * PART_MAXVAR);
    this.s1dot = new Float32Array(this.partCount * PART_MAXVAR); 
    this.constraintSize = 2.7;
    this.scaleSizeByDistance = 1;
          // NOTE: Float32Array objects are zero-filled by default.
  
    // Create & init all force-causing objects------------------------------------
    var fTmp = new CForcer();       // create a force-causing object, and
    // earth gravity for all particles:
    fTmp.forceType = F_GRAV_P;      // set it to earth gravity, and
    fTmp.targFirst = 0;             // set it to affect ALL particles:
    fTmp.partCount = -1;            // (negative value means ALL particles)
    this.forceList.push(fTmp);      // append this 'gravity' force object to 
  
    console.log("PartSys.initBouncy2D() created PartSys.forceList[] array of ");
    console.log("\t\t", this.forceList.length, "CForcer objects:");
    for(i=0; i<this.forceList.length; i++) {
      console.log("CForceList[",i,"]");
      this.forceList[i].printMe();
    }                   
  
    // Create & init all constraint-causing objects-------------------------------
    var cTmp = new CLimit();      // creat constraint-causing object, and
    cTmp.hitType = HIT_BOUNCE_VEL;  // set how particles 'bounce' from its surface,
    cTmp.limitType = LIM_VOL;       // confine particles inside axis-aligned 
                                    // rectangular volume that
    cTmp.targFirst = 0;             // applies to ALL particles; starting at 0 
    cTmp.partCount = -1;            // through all the rest of them.
    cTmp.xMin = -1.0; cTmp.xMax = 1.0;  // box extent:  +/- 1.0 box at origin
    cTmp.yMin = -1.0; cTmp.yMax = 1.0;
    cTmp.zMin = -1.0; cTmp.zMax = 1.0;
    cTmp.Kresti = 1.0;              // bouncyness: coeff. of restitution.
                                    // (and IGNORE all other CLimit members...)
    this.limitList.push(cTmp);      // append this 'box' constraint object to the
                                    // 'limitList' array of constraint-causing objects.                                
    // Report:
    console.log("PartSys.initBouncy2D() created PartSys.limitList[] array of ");
    console.log("\t\t", this.limitList.length, "CLimit objects.");
  
    this.INIT_VEL =  60 * 0.15;		// initial velocity in meters/sec.
                      // adjust by ++Start, --Start buttons. Original value 
                      // was 0.15 meters per timestep; multiply by 60 to get
                      // meters per second.
    this.drag = 0.85;// units-free air-drag (scales velocity); adjust by d/D keys
    this.grav = 9.832;// gravity's acceleration(meter/sec^2); adjust by g/G keys.
                      // on Earth surface, value is 9.832 meters/sec^2.
    this.resti = 1.0; // units-free 'Coefficient of Restitution' for 
                      // inelastic collisions.  Sets the fraction of momentum 
                      // (0.0 <= resti < 1.0) that remains after a ball 
                      // 'bounces' on a wall or floor, as computed using 
                      // velocity perpendicular to the surface
    //--------------------------init Particle System Controls:
    this.runMode =  3;// Master Control: 0=reset; 1= pause; 2=step; 3=run
    this.solvType = SOLV_OLDGOOD;
    this.bounceType = 1;
                      
  //--------------------------------Create & fill VBO with state var s1 contents:
  // INITIALIZE s1, s2:
  //  NOTE: s1,s2 are a Float32Array objects, zero-filled by default.
  // That's OK for most particle parameters, but these need non-zero defaults:
  
    //hard code sun, dead center
    this.s1[PART_XPOS] = 0; 
    this.s1[PART_YPOS] = 0;
    this.s1[PART_ZPOS] = 0;
    this.s1[PART_WPOS] =  1.0;      // position 'w' coordinate;
    this.roundRand(); // Now choose random initial velocities too:
    this.s1[PART_XVEL] = 0.0;
    this.s1[PART_YVEL] = 0.0;
    this.s1[PART_ZVEL] = 0.0;
    this.s1[PART_MASS] =  1.98 * Math.pow(10, 30);      // mass, in kg.
    this.s1[PART_DIAM_INTERNAL] =  1000; // on-screen diameter, in pixels
    this.s1[PART_DIAM] = this.calculateDistanceScale(this.s1, 0);
    this.s1[PART_LIFELEFT] = 10 + 10*Math.random();// 10 to 20
    this.s1[PART_RENDMODE] = 0.0;
    this.s1[PART_AGE] = 30 + 30*Math.random();
    this.s1[PART_R] = 1;
    this.s1[PART_G] = 1;
    this.s1[PART_B] = 0;
    var j = PART_MAXVAR;  
    //everything else make relatively small
    for(var i = 1; i < this.partCount; i += 1, j+= PART_MAXVAR) {
      this.roundRand();       // set this.randX,randY,randZ to random location in 
                              // a 3D unit sphere centered at the origin.
      //all our bouncy-balls stay within a +/- 0.9 cube centered at origin; 
      // set random positions in a 0.1-radius ball centered at (-0.8,-0.8,-0.8)
      this.s1[j + PART_XPOS] = 0.99*this.randX; 
      this.s1[j + PART_YPOS] = 0.99*this.randY;
      this.s1[j + PART_ZPOS] = 0.99*this.randZ;
      this.s1[j + PART_WPOS] =  1.0;      // position 'w' coordinate;
      this.roundRand(); // Now choose random initial velocities too:
      this.s1[j + PART_XVEL] = this.INIT_VEL*(0.5*this.randX);
      this.s1[j + PART_YVEL] = this.INIT_VEL*(0.5*this.randY);
      this.s1[j + PART_ZVEL] = this.INIT_VEL*(0.5*this.randZ);
      this.s1[j + PART_MASS] =  50000000 + 25000000 * Math.random();      // mass, in kg.
      this.s1[j + PART_DIAM_INTERNAL] =  100 + 100*Math.random(); // on-screen diameter, in pixels
      this.s1[j + PART_DIAM] = this.calculateDistanceScale(this.s1, j);
      this.s1[j + PART_LIFELEFT] = 10 + 10*Math.random();// 10 to 20
      this.s1[j + PART_RENDMODE] = 0.0;
      this.s1[j + PART_AGE] = 30 + 30*Math.random();
      this.s1[j + PART_R] = Math.random();
      this.s1[j + PART_G] = 1;
      this.s1[j + PART_B] = 1;
      //----------------------------
      this.s2.set(this.s1);   // COPY contents of state-vector s1 to s2.
      this.s0.set(this.s1);
      this.sM.set(this.s1);
    }
  
    this.FSIZE = this.s1.BYTES_PER_ELEMENT;  // 'float' size, in bytes.
  // Create a vertex buffer object (VBO) in the graphics hardware: get its ID# 
    this.vboID = gl.createBuffer();
    if (!this.vboID) {
      console.log('PartSys.init() Failed to create the VBO object in the GPU');
      return -1;
    }
    // "Bind the new buffer object (memory in the graphics system) to target"
    // In other words, specify the usage of one selected buffer object.
    // What's a "Target"? it's the poorly-chosen OpenGL/WebGL name for the 
    // intended use of this buffer's memory; so far, we have just two choices:
    //	== "gl.ARRAY_BUFFER" meaning the buffer object holds actual values we 
    //      need for rendering (positions, colors, normals, etc), or 
    //	== "gl.ELEMENT_ARRAY_BUFFER" meaning the buffer object holds indices 
    // 			into a list of values we need; indices such as object #s, face #s, 
    //			edge vertex #s.
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vboID);
  
    // Write data from our JavaScript array to graphics systems' buffer object:
    gl.bufferData(gl.ARRAY_BUFFER, this.s1, gl.DYNAMIC_DRAW);
    // why 'DYNAMIC_DRAW'? Because we change VBO's content with bufferSubData() later
  
    // ---------Set up all attributes for VBO contents:
    //Get the ID# for the a_Position variable in the graphics hardware
    this.a_PositionID = gl.getAttribLocation(gl.program, 'a_Position');
    if(this.a_PositionID < 0) {
      console.log('PartSys.init() Failed to get the storage location of a_Position');
      return -1;
    }
    // Tell GLSL to fill the 'a_Position' attribute variable for each shader with
    // values from the buffer object chosen by 'gl.bindBuffer()' command.
    // websearch yields OpenGL version: 
    //		http://www.opengl.org/sdk/docs/man/xhtml/glVertexAttribPointer.xml
    gl.vertexAttribPointer(this.a_PositionID, 
            4,  // # of values in this attrib (1,2,3,4) 
            gl.FLOAT, // data type (usually gl.FLOAT)
            false,    // use integer normalizing? (usually false)
            PART_MAXVAR*this.FSIZE,  // Stride: #bytes from 1st stored value to next one
            PART_XPOS * this.FSIZE); // Offset; #bytes from start of buffer to 
                      // 1st stored attrib value we will actually use.
    // Enable this assignment of the bound buffer to the a_Position variable:
    gl.enableVertexAttribArray(this.a_PositionID);
    
    
    // --- NEW! particle 'age' attribute:--------------------------------
    //Get the ID# for the a_LifeLeft variable in the graphics hardware
    this.a_LifeLeftID = gl.getAttribLocation(gl.program, 'a_LifeLeft');
    if(this.a_LifeLeftID < 0) {
      console.log('PartSys.init() Failed to get the storage location of a_LifeLeft');
      return -1;
    }
    // Tell GLSL to fill the 'a_LifeSpan' attribute variable for each shader with
    // values from the buffer object chosen by 'gl.bindBuffer()' command.
    // websearch yields OpenGL version: 
    //		http://www.opengl.org/sdk/docs/man/xhtml/glVertexAttribPointer.xml
    gl.vertexAttribPointer(this.a_LifeLeftID, 
            1,  // # of values in this attrib (1,2,3,4) 
            gl.FLOAT, // data type (usually gl.FLOAT)
            false,    // use integer normalizing? (usually false)
            PART_MAXVAR*this.FSIZE,  // Stride: #bytes from 1st stored value to next one
            PART_LIFELEFT * this.FSIZE); // Offset; #bytes from start of buffer to 
                      // 1st stored attrib value we will actually use.
    // Enable this assignment of the bound buffer to the a_Position variable:
    gl.enableVertexAttribArray(this.a_LifeLeftID);
  
    this.a_AgeID = gl.getAttribLocation(gl.program, 'a_Age');
    if(this.a_AgeID < 0) {
      console.log('PartSys.init() Failed to get the storage location of a_Age');
      return -1;
    }
    // Tell GLSL to fill the 'a_LifeSpan' attribute variable for each shader with
    // values from the buffer object chosen by 'gl.bindBuffer()' command.
    // websearch yields OpenGL version: 
    //		http://www.opengl.org/sdk/docs/man/xhtml/glVertexAttribPointer.xml
    gl.vertexAttribPointer(this.a_AgeID, 
            1,  // # of values in this attrib (1,2,3,4) 
            gl.FLOAT, // data type (usually gl.FLOAT)
            false,    // use integer normalizing? (usually false)
            PART_MAXVAR*this.FSIZE,  // Stride: #bytes from 1st stored value to next one
            PART_AGE * this.FSIZE); // Offset; #bytes from start of buffer to 
                      // 1st stored attrib value we will actually use.
    // Enable this assignment of the bound buffer to the a_Position variable:
    gl.enableVertexAttribArray(this.a_AgeID);
  
    this.a_RGBLoc = gl.getAttribLocation(gl.program, 'a_RGB');
    if(this.a_RGBLoc < 0) {
      console.log('PartSys.init() Failed to get the storage location of a_RGB');
      return -1;
    }
    // Tell GLSL to fill the 'a_LifeSpan' attribute variable for each shader with
    // values from the buffer object chosen by 'gl.bindBuffer()' command.
    // websearch yields OpenGL version: 
    //		http://www.opengl.org/sdk/docs/man/xhtml/glVertexAttribPointer.xml
    gl.vertexAttribPointer(this.a_RGBLoc, 
            3,  // # of values in this attrib (1,2,3,4) 
            gl.FLOAT, // data type (usually gl.FLOAT)
            false,    // use integer normalizing? (usually false)
            PART_MAXVAR*this.FSIZE,  // Stride: #bytes from 1st stored value to next one
            PART_R * this.FSIZE); // Offset; #bytes from start of buffer to 
                      // 1st stored attrib value we will actually use.
    // Enable this assignment of the bound buffer to the a_Position variable:
    gl.enableVertexAttribArray(this.a_RGBLoc);

    this.a_DiameterLoc = gl.getAttribLocation(gl.program, 'a_Diameter');
    if(this.a_DiameterLoc < 0) {
      console.log('PartSys.init() Failed to get the storage location of a_Diameter');
      return -1;
    }

    gl.vertexAttribPointer(this.a_DiameterLoc, 
            1,  // # of values in this attrib (1,2,3,4) 
            gl.FLOAT, // data type (usually gl.FLOAT)
            false,    // use integer normalizing? (usually false)
            PART_MAXVAR*this.FSIZE,  // Stride: #bytes from 1st stored value to next one
            PART_DIAM * this.FSIZE); // Offset; #bytes from start of buffer to 
                      // 1st stored attrib value we will actually use.
    // Enable this assignment of the bound buffer to the a_Position variable:
    gl.enableVertexAttribArray(this.a_DiameterLoc);
}

PartSys.prototype.applyForces = function(s, fList) { 
//==============================================================================
// Clear the force-accumulator vector for each particle in state-vector 's', 
// then apply each force described in the collection of force-applying objects 
// found in 'fSet'.
// (this function will simplify our too-complicated 'draw()' function)
  // To begin, CLEAR force-accumulators for all particles in state variable 's'
  var j = 0;  // i==particle number; j==array index for i-th particle
  for(var i = 0; i < this.partCount; i += 1, j+= PART_MAXVAR) {
    s[j + PART_X_FTOT] = 0.0;
    s[j + PART_Y_FTOT] = 0.0;
    s[j + PART_Z_FTOT] = 0.0;
  }
  // then find and accumulate all forces applied to particles in state s:
  for(var k = 0; k < fList.length; k++) {  // for every CForcer in fList array,
    if(fList[k].forceType <=0) {     //.................Invalid force? SKIP IT!
      continue;         // negated to (temporarily) disable the CForcer,
    }
    var m = fList[k].targFirst;   // first affected particle # in our state 's'
    var mmax = this.partCount;    // Total number of particles in 's'
    if(fList[k].targCount==0){    // ! Apply force to e1,e2 particles only!
      m=mmax=0;   // don't let loop run; apply force to e1,e2 particles only.
    } else if (fList[k].targCount > 0) {   // ?did CForcer say HOW MANY particles?
      var tmp = fList[k].targCount;
      if(tmp < mmax) mmax = tmp;    // (but MAKE SURE mmax doesn't get larger)
      else console.log("\n\n!!PartSys.applyForces() index error!!\n\n");
    }
    //......................................Apply force specified by forceType 
    switch(fList[k].forceType) {    // what kind of force should we apply?
      case F_MOUSE:     // Spring-like connection to mouse cursor
        console.log("PartSys.applyForces(), fList[",k,"].forceType:", 
                                  fList[k].forceType, "NOT YET IMPLEMENTED!!");
        break;
      case F_GRAV_E:    // Earth-gravity pulls 'downwards' as defined by downDir
        var j = m*PART_MAXVAR;  // state var array index for particle # m
        for(; m<mmax; m++, j+=PART_MAXVAR) { // for every part# from m to mmax-1,
                      // force from gravity == mass * gravConst * downDirection
          s[j + PART_X_FTOT] += s[j + PART_MASS] * this.grav * 
                                                   fList[k].downDir.elements[0];
          s[j + PART_Y_FTOT] += s[j + PART_MASS] * this.grav * 
                                                   fList[k].downDir.elements[1];
          s[j + PART_Z_FTOT] += s[j + PART_MASS] * this.grav * 
                                                   fList[k].downDir.elements[2];
        }
        break;
      case F_GRAV_P:    // planetary gravity between particle # e1 and e2.
        //Gmm/r^2
        var bigG = 6.674 * Math.pow(10, -11);
        //similar logic to springs
        //but now, for each particle in partsys, we want them to exert a force on each other equivalent to Gmm/r^2
        for (var i = 0; i < this.partCount * PART_MAXVAR; i+=PART_MAXVAR) {
          for (var k = 0; k < this.partCount * PART_MAXVAR; k+=PART_MAXVAR) {
            if(i != k) {
              distance = Math.sqrt(Math.pow(s[i + PART_XPOS] - s[k + PART_XPOS], 2) +
                                   Math.pow(s[i + PART_YPOS] - s[k + PART_YPOS], 2) + 
                                   Math.pow(s[i + PART_ZPOS] - s[k + PART_ZPOS], 2));
              if(distance < NU_EPSILON) distance = NU_EPSILON;
              totalForce = bigG * s[i + PART_MASS] * s[k + PART_MASS] / Math.pow(distance, 2) * .0000000000000000001;
              v_distance = [s[i + PART_XPOS] - s[k + PART_XPOS], 
                              s[i + PART_YPOS] - s[k + PART_YPOS],
                              s[i + PART_ZPOS] - s[k + PART_ZPOS]];
                      
              s[i + PART_X_FTOT] -= v_distance[0] * totalForce;
              s[i + PART_Y_FTOT] -= v_distance[1] * totalForce;
              s[i + PART_Z_FTOT] -= v_distance[2] * totalForce;
            }
          }
        }
        break;
      case F_WIND:      // Blowing-wind-like force-field; fcn of 3D position
        for(var i = 0; i < this.partCount; i += 1, j+= PART_MAXVAR) {
          if(s[j + PART_ZPOS] < -.5) {
            s[j + PART_X_FTOT] += 60 * Math.random();
          }
        }
        break;
      case F_BUBBLE:    // Constant inward force (bub_force)to a 3D centerpoint 
                        // bub_ctr if particle is > bub_radius away from it.
        console.log("PartSys.applyForces(), fList[",k,"].forceType:", 
                                  fList[k].forceType, "NOT YET IMPLEMENTED!!");
        break;
      case F_DRAG:      // viscous drag: force = -K_drag * velocity.
        var j = m*PART_MAXVAR;  // state var array index for particle # m
        for(; m<mmax; m++, j+=PART_MAXVAR) { // for every particle# from m to mmax-1,
                      // force from gravity == mass * gravConst * downDirection
          s[j + PART_X_FTOT] -= fList[k].K_drag * s[j + PART_XVEL]; 
          s[j + PART_Y_FTOT] -= fList[k].K_drag * s[j + PART_YVEL];
          s[j + PART_Z_FTOT] -= fList[k].K_drag * s[j + PART_ZVEL];
          }
        break;
      case F_SPRING:
        var j = m*PART_MAXVAR;  // state var array index for particle # m
        //1) find distance between particles
        // Fix the first particle
        
        let restLength = fList[k].restLength;
        s[PART_XPOS] = 0.05;
        s[PART_YPOS] = 0.05;
        s[PART_ZPOS] = 0.7;
        for (; m<mmax - 1; m++, j+=PART_MAXVAR) {
          x_distance = Math.sqrt(Math.pow(s[j + PART_XPOS] - s[j + PART_MAXVAR + PART_XPOS], 2) +
                                Math.pow(s[j + PART_YPOS] - s[j + PART_MAXVAR + PART_YPOS], 2) + 
                                Math.pow(s[j + PART_ZPOS] - s[j + PART_MAXVAR + PART_ZPOS], 2));
          x_delta = fList[k].K_restLength - x_distance;
          totalForce = x_delta * fList[k].K_spring * fList[k].K_springDamp;
          v_distance = [s[j + PART_XPOS] - s[j + PART_MAXVAR + PART_XPOS], 
                          s[j + PART_YPOS] - s[j + PART_MAXVAR + PART_YPOS],
                          s[j + PART_ZPOS] - s[j + PART_MAXVAR + PART_ZPOS]];

          s[j + PART_X_FTOT] += v_distance[0] * totalForce;
          s[j + PART_Y_FTOT] += v_distance[1] * totalForce;
          s[j + PART_Z_FTOT] += v_distance[2] * totalForce;

          s[j + PART_MAXVAR + PART_X_FTOT] -= v_distance[0] * totalForce;
          s[j + PART_MAXVAR + PART_Y_FTOT] -= v_distance[1] * totalForce;
          s[j + PART_MAXVAR + PART_Z_FTOT] -= v_distance[2] * totalForce;
        }
        break;
      case F_SPRINGSET:
        console.log("PartSys.applyForces(), fList[",k,"].forceType:", 
                                  fList[k].forceType, "NOT YET IMPLEMENTED!!");
        break;
      case F_CHARGE:
        console.log("PartSys.applyForces(), fList[",k,"].forceType:", 
                                  fList[k].forceType, "NOT YET IMPLEMENTED!!");
        break;
      case F_BOIDS1:
        //Separation
        //solution: force that moves away from particles, very strong when very close
        var FSep = 50  * 0.1; //arbitrary constant
        let avgPositions1 = [0, 0, 0];
        for (var i = 0; i < this.partCount * PART_MAXVAR; i+=PART_MAXVAR) {
          for (var j = 0; j < this.partCount * PART_MAXVAR; j+=PART_MAXVAR) {
            if(i != j) {
              avgPositions1[0] += s[j + PART_XPOS];
              avgPositions1[1] += s[j + PART_YPOS];
              avgPositions1[2] += s[j + PART_ZPOS];
            }
          }
          if (this.partCount > 2) {
            avgPositions1[0] /= this.partCount - 1;
            avgPositions1[1] /= this.partCount - 1;
            avgPositions1[2] /= this.partCount - 1;
          }
          distance = Math.sqrt(Math.pow(s[i + PART_XPOS] - avgPositions1[0], 2) +
                               Math.pow(s[i + PART_YPOS] - avgPositions1[1], 2) + 
                               Math.pow(s[i + PART_ZPOS] - avgPositions1[2], 2));
          if(distance < NU_EPSILON) distance = NU_EPSILON;


          totalForce = FSep / (distance); //same relative size, maybe same constant usage?
          v_distance = [s[i + PART_XPOS] - avgPositions1[0], 
                          s[i + PART_YPOS] - avgPositions1[1],
                          s[i + PART_ZPOS] - avgPositions1[2]];
          //opposite direction from Sep
          s[i + PART_X_FTOT] += v_distance[0] * totalForce;
          s[i + PART_Y_FTOT] += v_distance[1] * totalForce;
          s[i + PART_Z_FTOT] += v_distance[2] * totalForce;
        }
        break;
      case F_BOIDS2:
        //Alignment -- hardest one
        //attempt: steer towards average heading of local flockmates
        //solution: force in general direction of weighted average based on difference
        var FAlign = 60 * 0.001; //arbitrary constant
        var avgdirection = [0.0, 0.0, 0.0];
        for (var i = 0; i < this.partCount * PART_MAXVAR; i+=PART_MAXVAR) {
          for (var j = 0; j < this.partCount * PART_MAXVAR; j+=PART_MAXVAR) {
            if(i != j) {
              distance = Math.sqrt(Math.pow(s[i + PART_XPOS] - s[j + PART_XPOS], 2) +
                                   Math.pow(s[i + PART_YPOS] - s[j + PART_YPOS], 2) + 
                                   Math.pow(s[i + PART_ZPOS] - s[j + PART_ZPOS], 2));
                                   if(distance < NU_EPSILON) distance = NU_EPSILON;
              avgdirection[0] += s[j + PART_XVEL] / distance;
              avgdirection[1] += s[j + PART_YVEL] / distance;
              avgdirection[2] += s[j + PART_ZVEL] / distance;
            }
          }
          //we have a distance, but how to convert to heading of flock?
          //will need direction vectors of flock too. 
          //need to calculate average direction of flock
          if (this.partCount > 2) {
            avgdirection[0] /= this.partCount - 1;
            avgdirection[1] /= this.partCount - 1;
            avgdirection[2] /= this.partCount - 1;
          }
          s[i + PART_X_FTOT] += avgdirection[0] * FAlign;
          s[i + PART_Y_FTOT] += avgdirection[1] * FAlign;
          s[i + PART_Z_FTOT] += avgdirection[2] * FAlign;
        }
        break;
      case F_BOIDS3:
        //Cohesion
        //solution: force that keeps particles together, weaker when further away, but not as strong as separation
        var FCoh = 20 * 0.3; //arbitrary constant
        let avgPositions3 = [0, 0, 0];
        for (var i = 0; i < this.partCount * PART_MAXVAR; i+=PART_MAXVAR) {
          for (var j = 0; j < this.partCount * PART_MAXVAR; j+=PART_MAXVAR) {
            if(i != j) {
              avgPositions3[0] += s[j + PART_XPOS];
              avgPositions3[1] += s[j + PART_YPOS];
              avgPositions3[2] += s[j + PART_ZPOS];
            }
          }
          if (this.partCount > 2) {
            avgPositions3[0] /= this.partCount - 1;
            avgPositions3[1] /= this.partCount - 1;
            avgPositions3[2] /= this.partCount - 1;
          }
          distance = Math.sqrt(Math.pow(s[i + PART_XPOS] - avgPositions3[0], 2) +
                               Math.pow(s[i + PART_YPOS] - avgPositions3[1], 2) + 
                               Math.pow(s[i + PART_ZPOS] - avgPositions3[2], 2));
                               if(distance < NU_EPSILON) distance = NU_EPSILON;
          totalForce = FCoh / (distance); //same relative size, maybe same constant usage?
          v_distance = [s[i + PART_XPOS] - avgPositions3[0], 
                          s[i + PART_YPOS] - avgPositions3[1],
                          s[i + PART_ZPOS] - avgPositions3[2]];
          //opposite direction from Sep
          s[i + PART_X_FTOT] -= v_distance[0] * totalForce;
          s[i + PART_Y_FTOT] -= v_distance[1] * totalForce;
          s[i + PART_Z_FTOT] -= v_distance[2] * totalForce;
        }
        break;
      default:
        console.log("!!!ApplyForces() fList[",k,"] invalid forceType:", fList[k].forceType);
        break;
    }
  }
}

PartSys.prototype.dotFinder = function(dest, src) {
//==============================================================================
// fill the already-existing 'dest' variable (a float32array) with the 
// time-derivative of given state 'src'.  
  var invMass;  // inverse mass
  var j = 0;  // i==particle number; j==array index for i-th particle
  for(var i = 0; i < this.partCount; i += 1, j+= PART_MAXVAR) {
    dest[j + PART_XPOS] = src[j + PART_XVEL];   // position derivative = velocity
    dest[j + PART_YPOS] = src[j + PART_YVEL];
    dest[j + PART_ZPOS] = src[j + PART_ZVEL];
    dest[j + PART_WPOS] = 0.0;                  // presume 'w' fixed at 1.0
    // Use 'src' current force-accumulator's values (set by PartSys.applyForces())
    // to find acceleration.  As multiply is FAR faster than divide, do this:
    invMass = 1.0 / src[j + PART_MASS];   // F=ma, so a = F/m, or a = F(1/m);
    dest[j + PART_XVEL] = src[j + PART_X_FTOT] * invMass; 
    dest[j + PART_YVEL] = src[j + PART_Y_FTOT] * invMass;
    dest[j + PART_ZVEL] = src[j + PART_Z_FTOT] * invMass;
    dest[j + PART_X_FTOT] = 0.0;  // we don't know how force changes with time;
    dest[j + PART_Y_FTOT] = 0.0;  // presume it stays constant during timestep.
    dest[j + PART_Z_FTOT] = 0.0;
    dest[j + PART_R] = 0.0;       // presume color doesn't change with time.
    dest[j + PART_G] = 0.0;
    dest[j + PART_B] = 0.0;
    dest[j + PART_MASS] = 0.0;    // presume mass doesn't change with time.
    dest[j + PART_DIAM] = 0.0;    // presume these don't change either...   
    dest[j + PART_RENDMODE] = 0.0;
    dest[j + PART_AGE] = 0.0;
    dest[j + PART_LIFELEFT] = 0.0;
  }
}

PartSys.prototype.render = function(s) {
  // Change on-screen diameter of particles.
  // This is in the render function because it has no bearing on any internal logic - only affects rendering.
  if (this.scaleSizeByDistance == 1) {
    var j = 0;
    for(var i = 0; i < this.partCount; i += 1, j+= PART_MAXVAR) { // for every particle# from m to mmax-1,
      // force from gravity == mass * gravConst * downDirection
      this.s1[j + PART_DIAM] = this.calculateDistanceScale(this.s1, j);
    }
  }

  gl.bufferSubData( 
          gl.ARRAY_BUFFER,  // specify the 'binding target': either
                  //    gl.ARRAY_BUFFER (VBO holding sets of vertex attribs)
                  // or gl.ELEMENT_ARRAY_BUFFER (VBO holding vertex-index values)
          0,      // offset: # of bytes to skip at the start of the VBO before 
                    // we begin data replacement.
          this.s1); // Float32Array data source.

	gl.uniform1i(this.u_runModeID, this.runMode);	// run/step/pause the particle system 

  // Draw our VBO's new contents:
  gl.drawArrays(gl.POINTS,          // mode: WebGL drawing primitive to use 
                0,                  // index: start at this vertex in the VBO;
                this.partCount);    // draw this many vertices.
}

PartSys.prototype.solver = function() {
    //==============================================================================
    // Find next state s2 from current state s1 (and perhaps some related states
    // such as s1dot, sM, sMdot, etc.) by the numerical integration method chosen
    // by PartSys.solvType.
		switch(this.solvType)
		{
		  case SOLV_EULER://--------------------------------------------------------
			// EXPLICIT or 'forward time' solver; Euler Method: s2 = s1 + h*s1dot
      for(var n = 0; n < this.s1.length; n++) { // for all elements in s1,s2,s1dot;
        this.s2[n] = this.s1[n] + this.s1dot[n] * (g_timeStep * 0.001); 
      }

		  break;
		case SOLV_OLDGOOD://-------------------------------------------------------------------
			// IMPLICIT or 'reverse time' solver, as found in bouncyBall04.goodMKS;
			// This category of solver is often better, more stable, but lossy.
			// -- apply acceleration due to gravity to current velocity:
			//				  s2[PART_YVEL] -= (accel. due to gravity)*(g_timestep in seconds) 
			//                  -= (9.832 meters/sec^2) * (g_timeStep/1000.0);
      var j = 0;  // i==particle number; j==array index for i-th particle
      for(var i = 0; i < this.partCount; i += 1, j+= PART_MAXVAR) {
  			//this.s2[j + PART_ZVEL] -= this.grav*(g_timeStep*0.001);
  			// -- apply drag: attenuate current velocity
  			this.s2[j + PART_XVEL] += this.s1dot[j + PART_XVEL] * (g_timeStep * 0.001);
  			this.s2[j + PART_YVEL] += this.s1dot[j + PART_YVEL] * (g_timeStep * 0.001);
  			this.s2[j + PART_ZVEL] += this.s1dot[j + PART_ZVEL] * (g_timeStep * 0.001);
  			// -- move our particle using current velocity:
  			// CAREFUL! must convert g_timeStep from milliseconds to seconds!
  			this.s2[j + PART_XPOS] += this.s2[j + PART_XVEL] * (g_timeStep * 0.001);
  			this.s2[j + PART_YPOS] += this.s2[j + PART_YVEL] * (g_timeStep * 0.001); 
  			this.s2[j + PART_ZPOS] += this.s2[j + PART_ZVEL] * (g_timeStep * 0.001);
  		}
			// What's the result of this rearrangement?
			//	IT WORKS BEAUTIFULLY! much more stable much more often...
		  break;
      case SOLV_MIDPOINT:         // Midpoint Method (see lecture notes)
      //s2 = s1 + timestep*sMdot (sM = s1 + (timestep/2) * s1dot), sMdot = dotFinder(sM)
      //so we find sM first
        var j = 0;  // i==particle number; j==array index for i-th particle
        for(var i = 0; i < this.partCount; i += 1, j+= PART_MAXVAR) {
          
          this.sM[j + PART_XVEL] = this.s1[j + PART_XVEL] + this.s1dot[j + PART_XVEL] * (g_timeStep * 0.0005);
          this.sM[j + PART_YVEL] = this.s1[j + PART_YVEL] + this.s1dot[j + PART_YVEL] * (g_timeStep * 0.0005);
          this.sM[j + PART_ZVEL] = this.s1[j + PART_ZVEL] + this.s1dot[j + PART_ZVEL] * (g_timeStep * 0.0005);
          this.sM[j + PART_XPOS] = this.s1[j + PART_XPOS] + this.sM[j + PART_XVEL] * (g_timeStep * 0.0005);
          this.sM[j + PART_YPOS] = this.s1[j + PART_YPOS] + this.sM[j + PART_YVEL] * (g_timeStep * 0.0005); 
          this.sM[j + PART_ZPOS] = this.s1[j + PART_ZPOS] + this.sM[j + PART_ZVEL] * (g_timeStep * 0.0005);
        }
        //this.sM should now be filled with relevant info
        sMdot = new Float32Array(this.partCount * PART_MAXVAR);
        this.applyForces(this.sM, this.forceList);
        this.dotFinder(sMdot, this.sM);
        var s2dot = new Float32Array(this.partCount * PART_MAXVAR);
        for (let i = 0; i < s2dot.length; i++) {
          s2dot[i] = (sMdot[i] - this.s1dot[i]) / 0.005;
        }
        j = 0;
        //sMdot found. Can now finish using s2
        for(var i = 0; i < this.partCount; i += 1, j+= PART_MAXVAR) {
          this.s2[j + PART_XVEL] = this.s1[j + PART_XVEL] + sMdot[j + PART_XVEL]* (g_timeStep * 0.001);
          this.s2[j + PART_YVEL] = this.s1[j + PART_YVEL] + sMdot[j + PART_YVEL]* (g_timeStep * 0.001);
          this.s2[j + PART_ZVEL] = this.s1[j + PART_ZVEL] + sMdot[j + PART_ZVEL]* (g_timeStep * 0.001);
          this.s2[j + PART_XPOS] = this.s1[j + PART_XPOS] + sMdot[j + PART_XPOS]* (g_timeStep * 0.001);
          this.s2[j + PART_YPOS] = this.s1[j + PART_YPOS] + sMdot[j + PART_YPOS]* (g_timeStep * 0.001);
          this.s2[j + PART_ZPOS] = this.s1[j + PART_ZPOS] + sMdot[j + PART_ZPOS]* (g_timeStep * 0.001);
  		}
      break;
    case SOLV_ADAMS_BASH:       // Adams-Bashforth Explicit Integrator
      //s2 = s1 + 3/2 h * s1dot - (h/2) * s0dot
      //similar logic to midpoint
      var s0dot = new Float32Array(this.partCount * PART_MAXVAR);
      this.dotFinder(s0dot, this.s0);
      j = 0;
      //sMdot found. Can now finish using s2
      for(var i = 0; i < this.partCount; i += 1, j+= PART_MAXVAR) {
        this.s2[j + PART_XPOS] = this.s1[j + PART_XPOS] + 1.5 * (g_timeStep * 0.001) * this.s1dot[j + PART_XPOS] + s0dot[j + PART_XPOS] * 0.5 * (g_timeStep * 0.001);
        this.s2[j + PART_YPOS] = this.s1[j + PART_YPOS] + 1.5 * (g_timeStep * 0.001) * this.s1dot[j + PART_YPOS] + s0dot[j + PART_YPOS] * 0.5 * (g_timeStep * 0.001);
        this.s2[j + PART_ZPOS] = this.s1[j + PART_ZPOS] + 1.5 * (g_timeStep * 0.001) * this.s1dot[j + PART_ZPOS] + s0dot[j + PART_ZPOS] * 0.5 * (g_timeStep * 0.001);
  			this.s2[j + PART_XVEL] = this.s1[j + PART_XVEL] + 1.5 * (g_timeStep * 0.001) * this.s1dot[j + PART_XVEL] + s0dot[j + PART_XVEL] * 0.5 * (g_timeStep * 0.001);
  			this.s2[j + PART_YVEL] = this.s1[j + PART_YVEL] + 1.5 * (g_timeStep * 0.001) * this.s1dot[j + PART_YVEL] + s0dot[j + PART_YVEL] * 0.5 * (g_timeStep * 0.001);
        this.s2[j + PART_ZVEL] = this.s1[j + PART_ZVEL] + 1.5 * (g_timeStep * 0.001) * this.s1dot[j + PART_ZVEL] + s0dot[j + PART_ZVEL] * 0.5 * (g_timeStep * 0.001);
  		}
      break;
    case SOLV_RUNGEKUTTA:       // Arbitrary degree, set by 'solvDegree'
      console.log('NOT YET IMPLEMENTED: this.solvType==' + this.solvType);
      break;
    case SOLV_BACK_EULER:       // 'Backwind' or Implicit Euler
    //we begin with euler
    for(var n = 0; n < this.s1.length; n++) { // for all elements in s1,s2,s1dot;
      this.s2[n] = this.s1[n] + this.s1dot[n] * (g_timeStep * 0.001); 
    }
    //but wait! we need to find the residue from calculating s3 via our approximation of s2. 
    var s2dot = new Float32Array(this.partCount * PART_MAXVAR);
    this.applyForces(this.s2, this.forceList);
    this.dotFinder(s2dot, this.s2);
    var s3 = new Float32Array(this.partCount * PART_MAXVAR);
    for(var n = 0; n < this.s1.length; n++) { // for all elements in s1,s2,s1dot;
      s3[n] = this.s2[n] + s2dot[n] * (g_timeStep * 0.001); 
    }
    //now we can remove residue
    var sErr = new Float32Array(this.partCount * PART_MAXVAR);
    for(var n = 0; n < this.s1.length; n++) { // for all elements in s1,s2,s1dot;
      sErr[n] = s3[n] - this.s1[n];
    }
    //errors found. fix s2
    for(var n = 0; n < this.s1.length; n++) { // for all elements in s1,s2,s1dot;
      this.s2[n] -= (sErr[n] / 2); 
    }
      break;
    case  SOLV_BACK_MIDPT:      // 'Backwind' or Implicit Midpoint
    var j = 0;  // i==particle number; j==array index for i-th particle
    for(var i = 0; i < this.partCount; i += 1, j+= PART_MAXVAR) {
      
      this.sM[j + PART_XVEL] = this.s1[j + PART_XVEL] + this.s1dot[j + PART_XVEL] * (g_timeStep * 0.0005);
      this.sM[j + PART_YVEL] = this.s1[j + PART_YVEL] + this.s1dot[j + PART_YVEL] * (g_timeStep * 0.0005);
      this.sM[j + PART_ZVEL] = this.s1[j + PART_ZVEL] + this.s1dot[j + PART_ZVEL] * (g_timeStep * 0.0005);
      this.sM[j + PART_XPOS] = this.s1[j + PART_XPOS] + this.sM[j + PART_XVEL] * (g_timeStep * 0.0005);
      this.sM[j + PART_YPOS] = this.s1[j + PART_YPOS] + this.sM[j + PART_YVEL] * (g_timeStep * 0.0005); 
      this.sM[j + PART_ZPOS] = this.s1[j + PART_ZPOS] + this.sM[j + PART_ZVEL] * (g_timeStep * 0.0005);
    }
    //this.sM should now be filled with relevant info
    sMdot = new Float32Array(this.partCount * PART_MAXVAR);
    this.applyForces(this.sM, this.forceList);
    this.dotFinder(sMdot, this.sM);
    var s2dot = new Float32Array(this.partCount * PART_MAXVAR);
    for (let i = 0; i < s2dot.length; i++) {
      s2dot[i] = (sMdot[i] - this.s1dot[i]) / 0.005;
    }
    j = 0;
    //sMdot found. Can now finish using s2
    for(var i = 0; i < this.partCount; i += 1, j+= PART_MAXVAR) {
      this.s2[j + PART_XVEL] = this.s1[j + PART_XVEL] + sMdot[j + PART_XVEL]* (g_timeStep * 0.001);
      this.s2[j + PART_YVEL] = this.s1[j + PART_YVEL] + sMdot[j + PART_YVEL]* (g_timeStep * 0.001);
      this.s2[j + PART_ZVEL] = this.s1[j + PART_ZVEL] + sMdot[j + PART_ZVEL]* (g_timeStep * 0.001);
      this.s2[j + PART_XPOS] = this.s1[j + PART_XPOS] + sMdot[j + PART_XPOS]* (g_timeStep * 0.001);
      this.s2[j + PART_YPOS] = this.s1[j + PART_YPOS] + sMdot[j + PART_YPOS]* (g_timeStep * 0.001);
      this.s2[j + PART_ZPOS] = this.s1[j + PART_ZPOS] + sMdot[j + PART_ZPOS]* (g_timeStep * 0.001);
  }
  //so s2 is now estimated. we then take backwards midpoint from s2 and s2dot 
  for(var i = 0; i < this.partCount; i += 1, j+= PART_MAXVAR) {
      
    this.sM[j + PART_XVEL] = this.s2[j + PART_XVEL] - s2dot[j + PART_XVEL] * (g_timeStep * 0.0005);
    this.sM[j + PART_YVEL] = this.s2[j + PART_YVEL] - s2dot[j + PART_YVEL] * (g_timeStep * 0.0005);
    this.sM[j + PART_ZVEL] = this.s2[j + PART_ZVEL] - s2dot[j + PART_ZVEL] * (g_timeStep * 0.0005);
    this.sM[j + PART_XPOS] = this.s2[j + PART_XPOS] - s2dot[j + PART_XPOS] * (g_timeStep * 0.0005);
    this.sM[j + PART_YPOS] = this.s2[j + PART_YPOS] - s2dot[j + PART_YPOS] * (g_timeStep * 0.0005); 
    this.sM[j + PART_ZPOS] = this.s2[j + PART_ZPOS] - s2dot[j + PART_ZPOS] * (g_timeStep * 0.0005);
  }
  //with sm approximation, we can redo the sMdot, and then get the s3 approximation
  var s3 = new Float32Array(this.partCount * PART_MAXVAR);
  this.applyForces(this.sM, this.forceList);
  this.dotFinder(sMdot, this.sM);
  for(var n = 0; n < this.s1.length; n++) { // for all elements in s1,s2,s1dot;
    s3[n] = this.s2[n] - sMdot[n] * (g_timeStep * 0.001); 
  }
  //can now find error
  var sErr = new Float32Array(this.partCount * PART_MAXVAR);
    for(var n = 0; n < this.s1.length; n++) { // for all elements in s1,s2,s1dot;
      sErr[n] = s3[n] - this.s1[n];
    }
    for(var i = 0; i < this.partCount; i += 1, j+= PART_MAXVAR) {
      this.s2[j + PART_XVEL] -= sErr[j + PART_XVEL] * (g_timeStep * 0.0005);
      this.s2[j + PART_YVEL] -= sErr[j + PART_YVEL] * (g_timeStep * 0.0005);
      this.s2[j + PART_ZVEL] -= sErr[j + PART_ZVEL] * (g_timeStep * 0.0005);
      this.s2[j + PART_XPOS] -= sErr[j + PART_XPOS] * (g_timeStep * 0.0005);
      this.s2[j + PART_YPOS] -= sErr[j + PART_YPOS] * (g_timeStep * 0.0005);
      this.s2[j + PART_ZPOS] -= sErr[j + PART_ZPOS] * (g_timeStep * 0.0005);
  }
  //adjust s2
      break;
    case SOLV_BACK_ADBASH:      // 'Backwind' or Implicit Adams-Bashforth
      console.log('NOT YET IMPLEMENTED: this.solvType==' + this.solvType);
      break;
    case SOLV_VERLET:          // Verlet semi-implicit integrator;
      //too confusing. gonna pass on doing this lol 
      break;
    case SOLV_VEL_VERLET:      // 'Velocity-Verlet'semi-implicit integrator
      //s2.pos = s1.pos + s1.vel * h + s1.acc * (h^2 /2)
      //s2.acc found via applyAllForces(s2)
      //s2.vel = s1.vel + (s2.acc + s1.acc)* (h/2)
      //s2. acc can also be found via doing an s2dot and getting velocity
      //it follows that s1.acc is just... well... s1dot.velocity
      var j = 0;
      var s2dot = new Float32Array(this.partCount * PART_MAXVAR);
      this.applyForces(this.s2, this.forceList);
      this.dotFinder(s2dot, this.s2);
      for(var i = 0; i < this.partCount; i += 1, j+= PART_MAXVAR) {
        this.s2[j + PART_XVEL] = this.s1[j + PART_XVEL] + (this.s1dot[j + PART_XVEL] + s2dot[j + PART_XVEL]) * (g_timeStep * 0.0005);
  			this.s2[j + PART_YVEL] = this.s1[j + PART_YVEL] + (this.s1dot[j + PART_YVEL] + s2dot[j + PART_YVEL]) * (g_timeStep * 0.0005);
        this.s2[j + PART_ZVEL] = this.s1[j + PART_ZVEL] + (this.s1dot[j + PART_ZVEL] + s2dot[j + PART_ZVEL]) * (g_timeStep * 0.0005);
        this.s2[j + PART_XPOS] = this.s1[j + PART_XPOS] + (g_timeStep * 0.001) * this.s1dot[j + PART_XPOS] + (this.s1dot[j + PART_XVEL] * 0.5 * Math.pow((g_timeStep * 0.001), 2));
        this.s2[j + PART_YPOS] = this.s1[j + PART_YPOS] + (g_timeStep * 0.001) * this.s1dot[j + PART_YPOS] + (this.s1dot[j + PART_YVEL] * 0.5 * Math.pow((g_timeStep * 0.001), 2));
        this.s2[j + PART_ZPOS] = this.s1[j + PART_ZPOS] + (g_timeStep * 0.001) * this.s1dot[j + PART_ZPOS] + (this.s1dot[j + PART_ZVEL] * 0.5 * Math.pow((g_timeStep * 0.001), 2));
  		}
      break;
    case SOLV_LEAPFROG:        // 'Leapfrog' integrator
      //according to wikipedia, very similar to vel verlet
      var j = 0;
      var s2dot = new Float32Array(this.partCount * PART_MAXVAR);
      this.applyForces(this.s2, this.forceList);
      this.dotFinder(s2dot, this.s2);
      //https://en.wikipedia.org/wiki/Leapfrog_integration
      //s2.pos = s1.pos + s1.vel + 1/2 s1dot.vel* h^2
      //s2.vel = s1.vel + 1/2 (s1dot.vel + s2.vel) * h
      for(var i = 0; i < this.partCount; i += 1, j+= PART_MAXVAR) {
        this.s2[j + PART_XVEL] = this.s1[j + PART_XVEL] + (this.s1dot[j + PART_XVEL] + s2dot[j + PART_XVEL]) * (g_timeStep * 0.0005);
  			this.s2[j + PART_YVEL] = this.s1[j + PART_YVEL] + (this.s1dot[j + PART_YVEL] + s2dot[j + PART_YVEL]) * (g_timeStep * 0.0005);
        this.s2[j + PART_ZVEL] = this.s1[j + PART_ZVEL] + (this.s1dot[j + PART_ZVEL] + s2dot[j + PART_ZVEL]) * (g_timeStep * 0.0005);
        this.s2[j + PART_XPOS] = this.s1[j + PART_XPOS] + (g_timeStep * 0.001) * this.s1dot[j + PART_XPOS] + (this.s1dot[j + PART_XVEL] * 0.5 * Math.pow((g_timeStep * 0.001), 2));
        this.s2[j + PART_YPOS] = this.s1[j + PART_YPOS] + (g_timeStep * 0.001) * this.s1dot[j + PART_YPOS] + (this.s1dot[j + PART_YVEL] * 0.5 * Math.pow((g_timeStep * 0.001), 2));
        this.s2[j + PART_ZPOS] = this.s1[j + PART_ZPOS] + (g_timeStep * 0.001) * this.s1dot[j + PART_ZPOS] + (this.s1dot[j + PART_ZVEL] * 0.5 * Math.pow((g_timeStep * 0.001), 2));
  		}
      break;
    default:
			console.log('?!?! unknown solver: this.solvType==' + this.solvType);
			break;
		}
		return;
}

PartSys.prototype.doConstraints = function(sNow, sNext, cList) {
  let cube_dimensions = this.constraintSize;
	if(this.bounceType==0) { //------------------------------------------------
    var j = 0;  // i==particle number; j==array index for i-th particle
    for(var i = 0; i < this.partCount; i += 1, j+= PART_MAXVAR) {
  		// simple velocity-reversal: 
  		if(      this.s2[j + PART_XPOS] < -cube_dimensions && this.s2[j + PART_XVEL] < 0.0) { 
  		  // bounce on left (-X) wall
  		   this.s2[j + PART_XVEL] = -this.resti * this.s2[j + PART_XVEL]; 
  		}
  		else if( this.s2[j + PART_XPOS] >  cube_dimensions && this.s2[j + PART_XVEL] > 0.0) {		
  		  // bounce on right (+X) wall
  			 this.s2[j + PART_XVEL] = -this.resti * this.s2[j + PART_XVEL];
  		} //---------------------------
  		if(      this.s2[j + PART_YPOS] < -cube_dimensions && this.s2[j + PART_YVEL] < 0.0) {
  			// bounce on floor (-Y)
  			 this.s2[j + PART_YVEL] = -this.resti * this.s2[j + PART_YVEL];
  		}
  		else if( this.s2[j + PART_YPOS] >  cube_dimensions && this.s2[j + PART_YVEL] > 0.0) {		
  		  // bounce on ceiling (+Y)
  			 this.s2[j + PART_YVEL] = -this.resti * this.s2[j + PART_YVEL];
  		} //---------------------------
  		if(      this.s2[j + PART_ZPOS] < -cube_dimensions && this.s2[j + PART_ZVEL] < 0.0) {
  			// bounce on near wall (-Z)
  			 this.s2[j + PART_ZVEL] = -this.resti * this.s2[j + PART_ZVEL];
  		}
  		else if( this.s2[j + PART_ZPOS] >  cube_dimensions && this.s2[j + PART_ZVEL] > 0.0) {		
  		  // bounce on far wall (+Z)
  			 this.s2[j + PART_ZVEL] = -this.resti * this.s2[j + PART_ZVEL];
  			}	
  	//--------------------------
    // The above constraints change ONLY the velocity; nothing explicitly
    // forces the bouncy-ball to stay within the walls. If we begin with a
    // bouncy-ball on floor with zero velocity, gravity will cause it to 'fall' 
    // through the floor during the next timestep.  At the end of that timestep
    // our velocity-only constraint will scale velocity by -this.resti, but its
    // position is still below the floor!  Worse, the resti-weakened upward 
    // velocity will get cancelled by the new downward velocity added by gravity 
    // during the NEXT time-step. This gives the ball a net downwards velocity 
    // again, which again gets multiplied by -this.resti to make a slight upwards
    // velocity, but with the ball even further below the floor. As this cycle
    // repeats, the ball slowly sinks further and further downwards.
    // THUS the floor needs this position-enforcing constraint as well:
  		if(      this.s2[j + PART_YPOS] < -cube_dimensions) this.s2[j + PART_YPOS] = -cube_dimensions;
      else if( this.s2[j + PART_YPOS] >  cube_dimensions) this.s2[j + PART_YPOS] =  cube_dimensions; // ceiling
      if(      this.s2[j + PART_XPOS] < -cube_dimensions) this.s2[j + PART_XPOS] = -cube_dimensions; // left wall
      else if( this.s2[j + PART_XPOS] >  cube_dimensions) this.s2[j + PART_XPOS] =  cube_dimensions; // right wall
      if(      this.s2[j + PART_ZPOS] < -cube_dimensions) this.s2[j + PART_ZPOS] = -cube_dimensions; // near wall
      else if( this.s2[j + PART_ZPOS] >  cube_dimensions) this.s2[j + PART_ZPOS] =  cube_dimensions; // far wall
		// Our simple 'bouncy-ball' particle system needs this position-limiting
		// constraint ONLY for the floor and not the walls, as no forces exist that
		// could 'push' a zero-velocity particle against the wall. But suppose we
		// have a 'blowing wind' force that pushes particles left or right? Any
		// particle that comes to rest against our left or right wall could be
		// slowly 'pushed' through that wall as well -- THUS we need position-limiting
		// constraints for ALL the walls:
    } // end of for-loop thru all particles
	} // end of 'if' for bounceType==0
	else if (this.bounceType==1) { 
	//-----------------------------------------------------------------
	  var j = 0;  // i==particle number; j==array index for i-th particle
    for(var i = 0; i < this.partCount; i += 1, j+= PART_MAXVAR) {
      //--------  left (-X) wall  ----------
  		if( this.s2[j + PART_XPOS] < -cube_dimensions) {// && this.s2[j + PART_XVEL] < 0.0 ) {
  		// collision!
  			this.s2[j + PART_XPOS] = -cube_dimensions;// 1) resolve contact: put particle at wall.
			  this.s2[j + PART_XVEL] = this.s1[j + PART_XVEL];  // 2a) undo velocity change:
  			this.s2[j + PART_XVEL] *= this.drag;	            // 2b) apply drag:
  		  // 3) BOUNCE:  reversed velocity*coeff-of-restitution.
  			// ATTENTION! VERY SUBTLE PROBLEM HERE!
  			// need a velocity-sign test here that ensures the 'bounce' step will 
  			// always send the ball outwards, away from its wall or floor collision. 
  			if( this.s2[j + PART_XVEL] < 0.0) 
  			    this.s2[j + PART_XVEL] = -this.resti * this.s2[j + PART_XVEL]; // need sign change--bounce!
  			else 
  			    this.s2[j + PART_XVEL] =  this.resti * this.s2[j + PART_XVEL]; // sign changed-- don't need another.
  		}
  		//--------  right (+X) wall  --------------------------------------------
  		else if( this.s2[j + PART_XPOS] >  cube_dimensions) { // && this.s2[j + PART_XVEL] > 0.0) {	
  		// collision!
  			this.s2[j + PART_XPOS] = cube_dimensions; // 1) resolve contact: put particle at wall.
  			this.s2[j + PART_XVEL] = this.s1[j + PART_XVEL];	// 2a) undo velocity change:
  			this.s2[j + PART_XVEL] *= this.drag;			        // 2b) apply drag:
  		  // 3) BOUNCE:  reversed velocity*coeff-of-restitution.
  			// ATTENTION! VERY SUBTLE PROBLEM HERE! 
  			// need a velocity-sign test here that ensures the 'bounce' step will 
  			// always send the ball outwards, away from its wall or floor collision. 
  			if(this.s2[j + PART_XVEL] > 0.0) 
  			    this.s2[j + PART_XVEL] = -this.resti * this.s2[j + PART_XVEL]; // need sign change--bounce!
  			else 
  			    this.s2[j + PART_XVEL] =  this.resti * this.s2[j + PART_XVEL];	// sign changed-- don't need another.
  		}
      //--------  floor (-Y) wall  --------------------------------------------  		
  		if( this.s2[j + PART_YPOS] < -cube_dimensions) { // && this.s2[j + PART_YVEL] < 0.0) {		
  		// collision! floor...  
  			this.s2[j + PART_YPOS] = -cube_dimensions;// 1) resolve contact: put particle at wall.
  			this.s2[j + PART_YVEL] = this.s1[j + PART_YVEL];	// 2a) undo velocity change:
  			this.s2[j + PART_YVEL] *= this.drag;		          // 2b) apply drag:	
  		  // 3) BOUNCE:  reversed velocity*coeff-of-restitution.
  			// ATTENTION! VERY SUBTLE PROBLEM HERE!
  			// need a velocity-sign test here that ensures the 'bounce' step will 
  			// always send the ball outwards, away from its wall or floor collision.
  			if(this.s2[j + PART_YVEL] < 0.0) 
  			    this.s2[j + PART_YVEL] = -this.resti * this.s2[j + PART_YVEL]; // need sign change--bounce!
  			else 
  			    this.s2[j + PART_YVEL] =  this.resti * this.s2[j + PART_YVEL];	// sign changed-- don't need another.
  		}
  		//--------  ceiling (+Y) wall  ------------------------------------------
  		else if( this.s2[j + PART_YPOS] > cube_dimensions ) { // && this.s2[j + PART_YVEL] > 0.0) {
  		 		// collision! ceiling...
  			this.s2[j + PART_YPOS] = cube_dimensions;// 1) resolve contact: put particle at wall.
  			this.s2[j + PART_YVEL] = this.s1[j + PART_YVEL];	// 2a) undo velocity change:
  			this.s2[j + PART_YVEL] *= this.drag;			        // 2b) apply drag:
  		  // 3) BOUNCE:  reversed velocity*coeff-of-restitution.
  			// ATTENTION! VERY SUBTLE PROBLEM HERE!
  			// need a velocity-sign test here that ensures the 'bounce' step will 
  			// always send the ball outwards, away from its wall or floor collision.
  			if(this.s2[j + PART_YVEL] > 0.0) 
  			    this.s2[j + PART_YVEL] = -this.resti * this.s2[j + PART_YVEL]; // need sign change--bounce!
  			else 
  			    this.s2[j + PART_YVEL] =  this.resti * this.s2[j + PART_YVEL];	// sign changed-- don't need another.
  		}
  		//--------  near (-Z) wall  --------------------------------------------- 
  		if( this.s2[j + PART_ZPOS] < -cube_dimensions ) { // && this.s2[j + PART_ZVEL] < 0.0 ) {
  		// collision! 
  			this.s2[j + PART_ZPOS] = -cube_dimensions;// 1) resolve contact: put particle at wall.
  			this.s2[j + PART_ZVEL] = this.s1[j + PART_ZVEL];  // 2a) undo velocity change:
  			this.s2[j + PART_ZVEL] *= this.drag;			        // 2b) apply drag:
  		  // 3) BOUNCE:  reversed velocity*coeff-of-restitution.
  			// ATTENTION! VERY SUBTLE PROBLEM HERE! ------------------------------
  			// need a velocity-sign test here that ensures the 'bounce' step will 
  			// always send the ball outwards, away from its wall or floor collision. 
  			if( this.s2[j + PART_ZVEL] < 0.0) 
  			    this.s2[j + PART_ZVEL] = -this.resti * this.s2[j + PART_ZVEL]; // need sign change--bounce!
  			else 
  			    this.s2[j + PART_ZVEL] =  this.resti * this.s2[j + PART_ZVEL];	// sign changed-- don't need another.
  		}
  		//--------  far (+Z) wall  ---------------------------------------------- 
  		else if( this.s2[j + PART_ZPOS] >  cube_dimensions) { // && this.s2[j + PART_ZVEL] > 0.0) {	
  		// collision! 
  			this.s2[j + PART_ZPOS] = cube_dimensions; // 1) resolve contact: put particle at wall.
  			this.s2[j + PART_ZVEL] = this.s1[j + PART_ZVEL];  // 2a) undo velocity change:
  			this.s2[j + PART_ZVEL] *= this.drag;			        // 2b) apply drag:
  		  // 3) BOUNCE:  reversed velocity*coeff-of-restitution.
  			// ATTENTION! VERY SUBTLE PROBLEM HERE! ------------------------------
  			// need a velocity-sign test here that ensures the 'bounce' step will 
  			// always send the ball outwards, away from its wall or floor collision.   			
  			if(this.s2[j + PART_ZVEL] > 0.0) 
  			    this.s2[j + PART_ZVEL] = -this.resti * this.s2[j + PART_ZVEL]; // need sign change--bounce!
  			else 
  			    this.s2[j + PART_ZVEL] =  this.resti * this.s2[j + PART_ZVEL];	// sign changed-- don't need another.
  		} // end of (+Z) wall constraint
  	} // end of for-loop for all particles
	} // end of bounceType==1 
	else {
		console.log('?!?! unknown constraint: PartSys.bounceType==' + this.bounceType);
		return;
	}

//-----------------------------add 'age' constraint:
  if(this.isFountain == 1)    // When particle age falls to zero, re-initialize
                              // to re-launch from a randomized location with
                              // a randomized velocity and randomized age.
                              
  var j = 0;  // i==particle number; j==array index for i-th particle
  // console.log(this.randX)
  for(var i = 0; i < this.partCount; i += 1, j+= PART_MAXVAR) {
    this.s2[j + PART_AGE] -= 1.5;     // decrement lifetime.
    this.s2[j + PART_R] *= 0.89;
    this.s2[j + PART_G] *= 0.7;
    this.s2[j + PART_B] *= 0.95;
    // this.s2[j + PART_AGE] -= Math.random() * 1;
    if(this.s2[j + PART_AGE] <= 0) { // End of life: RESET this particle!
      this.roundRand();       // set this.randX,randY,randZ to random location in 
                              // a 3D unit sphere centered at the origin.
      //all our bouncy-balls stay within a +/- 0.9 cube centered at origin; 
      // set random positions in a 0.1-radius ball centered at (-0.8,-0.8,-0.8)
      this.s2[j + PART_XPOS] = -0.0 + 0.2*this.randX; 
      this.s2[j + PART_YPOS] = -0.0 + 0.2*this.randY;  
      this.s2[j + PART_ZPOS] = -0.5 + 0.2*this.randZ;
      this.s2[j + PART_WPOS] =  1.0;      // position 'w' coordinate;
      this.roundRand(); // Now choose random initial velocities too:
      this.s2[j + PART_XVEL] =  this.INIT_VEL*(0.0 + 0.2*this.randX);
      this.s2[j + PART_YVEL] =  this.INIT_VEL*(0.0 + 0.2*this.randY);
      this.s2[j + PART_ZVEL] =  this.INIT_VEL*(0.5 + 0.2*this.randZ);
      this.s2[j + PART_MASS] =  1.0;      // mass, in kg.
      this.s1[j + PART_DIAM_INTERNAL] = 60 + 10*Math.random();
      this.s1[j + PART_DIAM] = this.calculateDistanceScale(this.s1, j);// on-screen diameter, in pixels
      this.s2[j + PART_RENDMODE] = 0.0;
      this.s2[j + PART_AGE] = 30 + 30*Math.random();
      this.s2[j + PART_LIFELEFT] = 10;
      this.s2[j + PART_R] = 1;
      this.s2[j + PART_G] = 1;
      this.s2[j + PART_B] = 1;
      } // if age <=0
  } // for loop thru all particles
}

PartSys.prototype.switchToMe = function() {
  gl.useProgram(gl.program);	
	gl.bindBuffer(gl.ARRAY_BUFFER,	        // GLenum 'target' for this GPU buffer 
  this.vboID);			    // the ID# the GPU uses for our VBO.
	gl.vertexAttribPointer(this.a_PositionID, 
		4,  // # of values in this attrib (1,2,3,4) 
		gl.FLOAT, // data type (usually gl.FLOAT)
		false,    // use integer normalizing? (usually false)
		PART_MAXVAR*this.FSIZE,  // Stride: #bytes from 1st stored value to next one
		PART_XPOS * this.FSIZE); // Offset; #bytes from start of buffer to 		
	gl.enableVertexAttribArray(this.a_PosLoc);

  gl.vertexAttribPointer(this.a_DiameterLoc, 
    1,  // # of values in this attrib (1,2,3,4) 
    gl.FLOAT, // data type (usually gl.FLOAT)
    false,    // use integer normalizing? (usually false)
    PART_MAXVAR*this.FSIZE,  // Stride: #bytes from 1st stored value to next one
    PART_DIAM * this.FSIZE); // Offset; #bytes from start of buffer to 
              // 1st stored attrib value we will actually use.
  // Enable this assignment of the bound buffer to the a_Position variable:
  gl.enableVertexAttribArray(this.a_DiameterLoc);

	gl.vertexAttribPointer(this.a_LifeLeftID, 
		1,  // # of values in this attrib (1,2,3,4) 
		gl.FLOAT, // data type (usually gl.FLOAT)
		false,    // use integer normalizing? (usually false)
		PART_MAXVAR*this.FSIZE,  // Stride: #bytes from 1st stored value to next one
		PART_LIFELEFT * this.FSIZE); // Offset; #bytes from start of buffer to 
				  // 1st stored attrib value we will actually use.
	// Enable this assignment of the bound buffer to the a_Position variable:
	gl.enableVertexAttribArray(this.a_LifeLeftID);

  gl.vertexAttribPointer(this.a_AgeID, 
    1,  // # of values in this attrib (1,2,3,4) 
    gl.FLOAT, // data type (usually gl.FLOAT)
    false,    // use integer normalizing? (usually false)
    PART_MAXVAR*this.FSIZE,  // Stride: #bytes from 1st stored value to next one
    PART_AGE * this.FSIZE); // Offset; #bytes from start of buffer to 
              // 1st stored attrib value we will actually use.
  // Enable this assignment of the bound buffer to the a_Position variable:
  gl.enableVertexAttribArray(this.a_AgeID);

  gl.vertexAttribPointer(this.a_RGBLoc, 
    3,  // # of values in this attrib (1,2,3,4) 
    gl.FLOAT, // data type (usually gl.FLOAT)
    false,    // use integer normalizing? (usually false)
    PART_MAXVAR*this.FSIZE,  // Stride: #bytes from 1st stored value to next one
    PART_R * this.FSIZE); // Offset; #bytes from start of buffer to 
              // 1st stored attrib value we will actually use.
  // Enable this assignment of the bound buffer to the a_Position variable:
  gl.enableVertexAttribArray(this.a_RGBLoc);
}

PartSys.prototype.calculateDistanceScale = function(s, j) {
  /*
  j is partNum * PART_MAXVAR
  */
  // force from gravity == mass * gravConst * downDirection
  let distance = Math.sqrt(Math.pow(s[j + PART_XPOS] - eyePos.elements[0], 2) + 
                           Math.pow(s[j + PART_YPOS] - eyePos.elements[1], 2) + 
                           Math.pow(s[j + PART_ZPOS] - eyePos.elements[2], 2));
  return s[j + PART_DIAM_INTERNAL] / distance;
}

PartSys.prototype.swap = function() {
  this.s1.set(this.s2);     // set values of s1 array to match s2 array.
  this.s0.set(this.s1);
}
