
// WALLET STRUCTURE SKETCH
var wallet = function(p){
	var layout_blocks = []
	var blocks = []
	const layout_blocks_count = 64
	var occupied_count = 0;
	var max_entries = 14
	
	p.setup = function() {
	  // Get container properties
	  let b = document.getElementById("wallet_structure_holder");
	  let w = b.clientWidth;
	  let h = b.clientHeight;
	  
	  // Create canvas
	  var canvas = p.createCanvas(w, w/2);
	  canvas.parent('wallet_structure_holder');
	  p.frameRate(4);
	  
	  p.drawWalletTitles();
	  
	  // Create bits and blocks
	  for (var i = 0; i < layout_blocks_count; i++){
		layout_blocks[i] = new BlockList(i);
	  }
	  
	  p.createBlocks();
	}

	p.draw = function() { 
	  p.randomOperation();
	}
	
	p.drawWalletTitles = function(){
	  p.fill(0);
	  p.stroke(0);
	  p.textAlign(p.CENTER, p.CENTER);
	  p.textSize(p.width/30);
	  p.text("Layout Blocks:", p.width/2, p.height/12);
	  p.text("Encrypted Text Blocks:", p.width/2, p.height/1.8);
	  p.stroke(247, 243, 227);
	}
	
	p.windowResized = function() {
	  // Get container properties
	  let b = document.getElementById("wallet_structure_holder");
	  let w = b.clientWidth;
	  let h = b.clientHeight;
	  
	  // Resize canvas
	  p.resizeCanvas(w, w/2);
	  p.background(247, 243, 227);
	  p.drawWalletTitles();
	  for (var i = 0; i < blocks.length; i++){
		blocks[i].display();
	  }
	  for (var i = 0; i < layout_blocks.length; i++){
		layout_blocks[i].display();
	  }
	}
	
	p.createBlocks = function(){
	  for (var i = 0; i < layout_blocks_count; i++){
		for (var j = 0; j < max_entries; j++){
		  var index = j*layout_blocks_count + i;
		  blocks[index] = new WalletBlock(index);
		  blocks[index].display();
		}
	  }
	}

	// Randomly delete/add blocks
	p.randomOperation = function(){
		if (p.random(1) > occupied_count/layout_blocks_count){
			p.addWallet();
		} else {
			p.deleteWallet();
		}
	}

	// Allocate a block
	p.addWallet = function(){
	  occupied = []
	  for (var i = 0; i < layout_blocks.length; i++){
		if (layout_blocks[i].occupied == true){
		  occupied[occupied.length] = i;
		}
	  }
	  
	  if (occupied.length == layout_blocks_count){
		return;
	  }
	  
	  for (var i = 0; i < layout_blocks.length; i++){
		if (layout_blocks[i].occupied == false){
		  layout_blocks[i].occupy(p.int(p.random(3, max_entries)), p.color(p.random(255), p.random(255), p.random(255)));
		  break;
		}
	  }
	  
	  occupied_count=occupied.length;
	}

	// Delete a block
	p.deleteWallet = function(){
	  occupied = []
	  for (var i = 0; i < layout_blocks.length; i++){
		if (layout_blocks[i].occupied == true){
		  occupied[occupied.length] = i;
		}
	  }
	  
	  if (occupied.length == 0){
		return;
	  }
	  
	  var random_index = p.int(p.random(0, occupied.length-1));
	  layout_blocks[occupied[random_index]].free();
	  for (i = random_index; i < occupied.length-1; i++){
		layout_blocks[occupied[i]].shift(layout_blocks[occupied[i+1]].count, layout_blocks[occupied[i+1]].colour, layout_blocks[occupied[i+1]].occupied_indexes);
	  }
	  layout_blocks[occupied.pop()].clear();
	  
	  occupied_count=occupied.length;
	}

	class BlockList {
	  constructor(index){
		this.occupied = false;
		this.index = index;
		this.count = 0;
		this.colour = p.color(247, 243, 227);
		this.occupied_indexes = []
	  }
	  
	  display(){
		p.fill(this.colour);
		for (var i = 0; i < this.count; i++){
		  p.rect(p.map(this.index, 0, layout_blocks_count, 10, p.width-10), p.width/15 + (p.width/(layout_blocks_count*1.25) * i), p.width/(layout_blocks_count*1.5), p.width/(layout_blocks_count*1.5));
		}
	  }
	  
	  shift(count, colour, new_indexes){
		this.clear();
		
		this.occupied = true;
		this.count = count;
		this.colour = colour;
		this.occupied_indexes = new_indexes;
		this.display();
	  }
	  
	  clear(){
		this.colour = p.color(247, 243, 227);
		this.count = max_entries;
		this.display();
		
		this.occupied_indexes = []
		this.occupied = false;
		this.count = 0;
	  }
	  
	  occupy(count, colour){
		this.count = count;
		this.colour = colour;
		this.occupied = true;
		this.occupied_indexes = []
		
		for (var i = 0; i < blocks.length; i++){
		  if (blocks[i].occupied == false){
			this.occupied_indexes[this.occupied_indexes.length] = i;
			blocks[i].occupy(this.colour);
			
			if (this.occupied_indexes.length == this.count){
			  break;
			}
		  }
		}
		
		this.display();
	  }
	  
	  free(){
		for (var i = 0; i < this.count; i++){
		  blocks[this.occupied_indexes[i]].free();
		}
		
		this.clear();
		
		this.occupied_indexes = []
		this.occupied = false;
		this.display();
		this.count = 0;
	  }
	}

	// For storing a block
	class WalletBlock {
	  constructor(index) {
		this.index = index;
		this.col = p.color(255, 255, 255);
		this.occupied = false;
	  }
	  
	  // Display the 3 text elements of the block
	  display(){
		p.fill(this.col);
		p.rect(p.map(this.index%layout_blocks_count, 0, layout_blocks_count, 10, p.width-10), p.height/1.6 + (p.width/(layout_blocks_count*1.25) * p.floor(this.index/layout_blocks_count)), p.width/(layout_blocks_count*1.5), p.width/(layout_blocks_count*1.5));
	  }
	  
	  // Occupy the block
	  occupy(col){
		this.col = col;
		this.display();
		this.occupied = true;
	  }
	  
	  // Free the block
	  free(){
		this.col = p.color(255, 255, 255);
		this.display();
		this.occupied = false;
	  }
	  
	  clear(){
		this.col = p.color(255, 255, 255);
		this.display();
	  }
	}
}
var myp5 = new p5(wallet, 'wallet_structure_holder');

// PASSWORD SKETCH
var password = function(p2){
	var bits = []
	var blocks = []
	const bit_count = 64;
	var occupied_count = 0;

	p2.setup = function() {
	  // Get container properties
	  let b = document.getElementById("password_structure_holder");
	  let w = b.clientWidth;
	  let h = b.clientHeight;
	  
	  // Create canvas
	  var canvas = p2.createCanvas(w, w/5);
	  canvas.parent('password_structure_holder');
	  p2.frameRate(4);
	  p2.background(247, 243, 227);

	  drawTitles();
	  
	  // Create bits and blocks
	  for (var i = 0; i < bit_count; i++){
		blocks[i] = new Block(i);
		bits[i] = new Bit(i, blocks[i]);
		bits[i].display();
	  }
	}

	drawTitles = function(){
	  // Draw the titles
	  p2.fill(0);
	  p2.stroke(0);
	  p2.textAlign(p2.CENTER, p2.CENTER);
	  p2.textSize(p2.width/30);
	  p2.text("Bits:", p2.width/2, p2.height/12);
	  p2.text("Blocks:", p2.width/2, p2.height/2);
	  p2.stroke(247, 243, 227);
	}

	p2.windowResized = function() {
	  // Get container properties
	  let b = document.getElementById("password_structure_holder");
	  let w = b.clientWidth;
	  let h = b.clientHeight;
	  
	  // Resize canvas
	  p2.resizeCanvas(w, w/4);
	  p2.background(247, 243, 227);
	  drawTitles();
	  for (var i = 0; i < bits.length; i++){
		bits[i].display();
		blocks[i].display();
	  }
	}

	p2.draw = function() {
	  for (var i = 0; i < bits.length; i++){
		bits[i].display();
		blocks[i].display();
	  }
	  
	  p2.randomOperation();
	}

	// Randomly delete/add blocks
	p2.randomOperation = function(){
	  if (p2.random(0, 1) > occupied_count/bit_count + p2.random(-0.25, 0.25)){
		if (occupied_count < bit_count){
		  p2.addBlock();
		  occupied_count++;
		}
	  } else {
		if (occupied_count > 0){
		  p2.deleteBlock();
		  occupied_count--;
		}
	  }
	}

	// Allocate a block
	p2.addBlock = function(){
	  for (var i = 0; i < bits.length; i++){
		if (bits[i].occupied == false){
		  bits[i].occupy(p2.color(p2.random(255), p2.random(255), p2.random(255)));
		  break;
		}
	  }
	}

	// Delete a block
	p2.deleteBlock = function(){
	  occupied = []
	  for (var i = 0; i < bits.length; i++){
		if (bits[i].occupied == true){
		  occupied[occupied.length] = i;
		}
	  }
	  
	  bits[occupied[p2.int(p2.random(0, occupied.length-1))]].free();
	}

	// For storing a bit
	class Bit {
	  constructor(index, block) {
		this.index = index;
		this.occupied = false;
		this.block = block;
		this.col = p2.color(255, 255, 255);
	  }
	  
	  // Display the bit
	  display(){
		p2.fill(this.col);
		p2.rect(p2.map(this.index, 0, bit_count, 10, p2.width-10), p2.height/5, p2.width/(bit_count*1.5), p2.width/(bit_count*1.5));
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
		this.col = p2.color(255, 255, 255);
		this.display();
		this.occupied = false;
	  }
	}

	// For storing a block
	class Block {
	  constructor(index) {
		this.index = index;
		this.col = p2.color(255, 255, 255);
	  }
	  
	  // Display the 3 text elements of the block
	  display(){
		p2.fill(this.col);
		for (var i = 0; i < 3; i++){
			p2.rect(p2.map(this.index, 0, bit_count, 10, p2.width-10), 2/3 * p2.height + (i * p2.height/8), p2.width/(bit_count*1.5), p2.width/(bit_count*1.5));
		}
	  }
	  
	  // Occupy the block
	  occupy(col){
		this.col = col;
		this.display();
	  }
	  
	  // Free the block
	  free(){
		this.col = p2.color(255, 255, 255);;
		this.display();
	  }
	}
}

var myp5 = new p5(password, 'password_structure_holder');
