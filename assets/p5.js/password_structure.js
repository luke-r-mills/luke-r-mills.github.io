var bits = []
var blocks = []
const bit_count = 64;
var occupied_count = 0;

function setup() {
  // Get container properties
  let b = document.getElementById("password_structure_holder");
  let w = b.clientWidth;
  let h = b.clientHeight;
  
  // Create canvas
  var canvas = createCanvas(w, w/4);
  canvas.parent('password_structure_holder');
  frameRate(4);
  background(247, 243, 227);

  drawTitles();
  
  // Create bits and blocks
  for (var i = 0; i < bit_count; i++){
    blocks[i] = new Block(i);
    bits[i] = new Bit(i, blocks[i]);
	bits[i].display();
  }
}

function drawTitles(){
  // Draw the titles
  fill(0);
  stroke(0);
  textAlign(CENTER, CENTER);
  textSize(height/10);
  text("Bits:", width/2, height/12);
  text("Blocks:", width/2, 5*height/12);
  stroke(247, 243, 227);
}

function windowResized() {
  // Get container properties
  let b = document.getElementById("password_structure_holder");
  let w = b.clientWidth;
  let h = b.clientHeight;
  
  // Resize canvas
  resizeCanvas(w, w/4);
  background(247, 243, 227);
  drawTitles();
  for (var i = 0; i < bits.length; i++){
    bits[i].display();
    blocks[i].display();
  }
}

function draw() {
  for (var i = 0; i < bits.length; i++){
    bits[i].display();
    blocks[i].display();
  }
  
  randomOperation();
}

// Randomly delete/add blocks
function randomOperation(){
  if (random(0, 1) > occupied_count/bit_count + random(-0.25, 0.25)){
    if (occupied_count < bit_count){
      addBlock();
      occupied_count++;
    }
  } else {
    if (occupied_count > 0){
      deleteBlock();
      occupied_count--;
    }
  }
}

// Allocate a block
function addBlock(){
  for (var i = 0; i < bits.length; i++){
    if (bits[i].occupied == false){
      bits[i].occupy(color(random(255), random(255), random(255)));
      break;
    }
  }
}

// Delete a block
function deleteBlock(){
  occupied = []
  for (var i = 0; i < bits.length; i++){
    if (bits[i].occupied == true){
      occupied[occupied.length] = i;
    }
  }
  
  bits[occupied[int(random(0, occupied.length-1))]].free();
}

// For storing a bit
class Bit {
  constructor(index, block) {
    this.index = index;
    this.occupied = false;
    this.block = block;
    this.col = color(255, 255, 255);
  }
  
  // Display the bit
  display(){
    fill(this.col);
    rect(map(this.index, 0, bit_count, 10, width-10), height/6, width/(bit_count*1.5), height/20);
  }
  
  // Occupy the bit and corresponding block
  occupy(col){
    this.block.occupy(col);
    this.col = col;
    this.display();
    this.occupied = true;
  }
  
  // Free the bit and corresponsing block
  free(){
    this.block.free();
    this.col = color(255, 255, 255);
    this.display();
    this.occupied = false;
  }
}

// For storing a block
class Block {
  constructor(index) {
    this.index = index;
    this.col = color(255, 255, 255);
  }
  
  // Display the 3 text elements of the block
  display(){
    fill(this.col);
    rect(map(this.index, 0, bit_count, 10, width-10), height/2, width/(bit_count*1.5), height/20);
    rect(map(this.index, 0, bit_count, 10, width-10), 2*height/3, width/(bit_count*1.5), height/20);
    rect(map(this.index, 0, bit_count, 10, width-10), 5*height/6, width/(bit_count*1.5), height/20);
  }
  
  // Occupy the block
  occupy(col){
    this.col = col;
    this.display();
  }
  
  // Free the block
  free(){
    this.col = color(255, 255, 255);;
    this.display();
  }
}
