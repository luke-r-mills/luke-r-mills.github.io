bars = [];
barCnt = 250;
delay = 20

function setup() {
  var canvas = createCanvas(windowWidth-20, windowHeight/5);
  canvas.parent('sketch-holder');
  
  createBars();
  noStroke();
  
  pickRandomSort();
}

function draw() {
  background(149,219,229);
  drawBars();
}

function pickRandomSort(){
  selected = int(random(5))
	
  if (selected == 0) {
    bubbleSort();
  } else if (selected == 1) {
    selectionSort();
  } else if (selected == 2) {
    insertionSort();
  } else if (selected == 3) {
    mergeSort(0, bars.length - 1);
  } else if (selected == 4) {
    quickSort(0, bars.length - 1);
  }
}

function createBars() {
  bars = [];
  for (var i = 0; i < barCnt; i++) {
    Bar = {
      value: i,
	  index: i,
	  
	  getIndex: function(){
		return this.index;
	  },
	  
	  setIndex: function(index){
		this.index = index;  
	  },

      getValue: function() {
        return this.value;
      },
	  
	  drawBar: function() {
		fill(lerpColor(color(7,130,130), color(163, 120, 84), this.value / barCnt));
        rect(map(this.index, 0, barCnt, 0, windowWidth), map(this.value, 0, barCnt, 0, height), (windowWidth / barCnt) / 2, height);
      }
    }
    bars.push(Bar);
  }
  shuffleBars();
}

function windowResized() {
  resizeCanvas(windowWidth-20, height);
}

function drawBars() {
  for (var i = 0; i < bars.length; i++) {
    bars[i].drawBar();
  }
}

function swapBars(ind1, ind2) {
  var bar1 = bars[ind1];
  var bar2 = bars[ind2];
  var temp = bar1.getIndex();

  bar1.setIndex(bar2.getIndex());
  bar2.setIndex(temp);

  var tempBar = bar1;
  bars[ind1] = bar2;
  bars[ind2] = tempBar;
}

function shuffleBars() {
  for (var i = 0; i < bars.length * 10; i++) {
    var bar1 = Math.round(random(0, bars.length - 1));
    var bar2 = Math.round(random(0, bars.length - 1));
    swapBars(bar1, bar2);
  }
}

async function bubbleIter(j){
  await sleep(delay);

  for (var i = 0; i < bars.length - j - 1; i++) {
    if (bars[i].getValue() < bars[i + 1].getValue()) {
      await swapBars(i, i + 1);
    }
  }
}

async function bubbleSort() {
  for (var i = 0; i < bars.length - 1; i++){
    await bubbleIter(i);
  }
}

async function selectionIter(i){
  await sleep(delay);
  
  var minInd = i;
  for (var j = i + 1; j < bars.length; j++) {
    if (bars[j].getValue() > bars[minInd].getValue()) {
      minInd = j;
    }
  }

  swapBars(minInd, i);
}

async function selectionSort() {
  for (var i = 0; i < bars.length - 1; i++) {
    await selectionIter(i);
  }
}

async function insertionIter(i){
  await sleep(delay);
  var key = bars[i].getValue();
  var j = i - 1;

  while (j >= 0 && bars[j].getValue() < key) {
    swapBars(j + 1, j);
    j -= 1;
  }
}

async function insertionSort() {
  for(var i = 0; i < bars.length; i++) {
    await insertionIter(i);
  }
}

async function merge(start, mid, end) {
  var start2 = mid + 1;

  if (bars[mid].getValue() >= bars[start2].getValue()) {
    return;
  }

  while (start <= mid && start2 <= end) {
    await sleep(delay);
    if (bars[start].getValue() >= bars[start2].getValue()) {
      start++;
    } else {
      var index = start2;

      while (index != start) {
        swapBars(index, index - 1);
        index--;
      }

      start++;
      mid++;
      start2++;
    }
  }
}

async function mergeSort(l, r) {
  if (l < r) {
    var m = Math.floor(l + (r - l) / 2);

    await mergeSort(l, m);
    await mergeSort(m + 1, r);

    await merge(l, m, r);
  }
}

async function partition(low, high) {
  var pivot = bars[high];
  var i = (low - 1); // index of smaller element 
  for (var j = low; j < high; j++) {
    // If current element is smaller than the pivot 
    if (bars[j].getValue() > pivot.getValue()) {
      i++;
      await sleep(delay);
      swapBars(i, j);
    }
  }

  swapBars(i + 1, high);

  return i + 1;
}

async function quickSort(low, high) {
  if (low < high) {
    var pi = await partition(low, high);

    quickSort(low, pi - 1);
    quickSort(pi + 1, high);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}