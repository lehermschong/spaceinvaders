import { concat, from, fromEvent, interval,merge } from 'rxjs';
import { filter, map, scan, tap, mergeMap, takeUntil, reduce, min} from 'rxjs/operators';
type Key = 'ArrowLeft' | 'ArrowRight' | 'Space' | 'KeyR'
type Event = 'keydown' | 'keyup'
function spaceinvaders() {
  // Inside this function you will use the classes and functions 
  // from rx.js
  // to add visuals to the svg element in pong.html, animate them, and make them interactive.
  // Study and complete the tasks in observable exampels first to get ideas.
  // Course Notes showing Asteroids in FRP: https://tgdwyer.github.io/asteroids/ 
  // You will be marked on your functional programming style
  // as well as the functionality that you implement.
  // Document your key!
  const 
  Constants = {
    CanvasSize: 600,
    BulletRadius: 3,
    BulletVelocity: 3,
    StartingAlienRow: 1,
    StartingAlienColumn:11,
    ShipRadius: 10,
    AlienRadius: 10,
    AlienSpeed: 1,
    ChancetoShoot: 0.01,
    StartingWallCount: 5,
    WallRadius: 40,
    AlienBoundary:420,
    HoleRadius:10,
    ShipSpeed: 2,
    LevelCap: 5
  } as const
  //CLASSES AND SHIT
  type ViewType = 'ship' | 'pbullet' | 'ebullet' | 'alien' | 'wall' | 'hole'
  class Tick { constructor(public readonly elapsed:number) {} }
  class Move {constructor(public readonly movement: Vec) {}}
  class Shoot { constructor() {} } 
  class RestartGame {constructor() {}}
  class Vec {
    constructor(public readonly x: number = 0, public readonly y: number = 0) {}
    add = (b:Vec) => new Vec(this.x + b.x, this.y + b.y)
    sub = (b:Vec) => this.add(b.scale(-1))
    boundedAdd = (b: Vec) => (lowerBound: Vec) => (upperBound: Vec) =>{
      type Axis = 'x' | 'y'
      const helper_add = (axis:Axis) =>      
        Math.max(Math.min(this[axis] + b[axis], upperBound[axis]), lowerBound[axis]);
      return new Vec(helper_add('x'),helper_add('y'))
    }
    len = ()=> Math.sqrt(this.x*this.x + this.y*this.y)
    scale = (s:number) => new Vec(this.x*s,this.y*s)
    ortho = ()=> new Vec(this.y,-this.x)
    reflect = () => new Vec(-this.x,-this.y)
    static unitVecInDirection = () => new Vec(0,-1)
    static Zero = new Vec();
  } 
  class RNG {
    /**
     * LCG using GCC's constants. Everything here is private to hide implementation details outside
     * the class. They are readonly to prevent mutation.
     */
    private static readonly m = 0x80000000; // 2**31
    private static readonly a = 1103515245;
    private static readonly c = 12345;
  
    /**
     * Constructor for the RNG.
     * 
     * @param seed the seed for our RNG. This is made readonly to prevent mutation.
     */
    constructor(private readonly seed: number = 0) { }
  
    /**
     * Generates the next random integer along with a new RNG with a different seed. This approach
     * avoids the need of having a mutable state for our RNG. This method is made private as there is
     * no need to call this method outside the class.
     *
     * @returns an object with an integer value and the next RNG object.
     */
    private readonly nextInt = () => {
      return (RNG.a * this.seed + RNG.c) % RNG.m;
    }
  
    /**
     * Generates the next random floating number in the range [0..1]. Very much like nextInt, it
     * returns a single number along with a new RNG as there is no way to mutate the state of this RNG
     * object. This method is declared readonly to prevent the method from being redefined outside the
     * class.
     *
     * @returns an object with an integer value and the next RNG object.
     */
    readonly nextFloat = () => {
      // returns in range [0,1]
        return this.nextInt() / (RNG.m - 1) // convert the integer into a float
      };
    readonly next=()=>
      new RNG(this.nextInt())
    
  }
  type Body = Readonly<{
    id:string,
    viewType: ViewType
    pos: Vec,
    vel: Vec,
    acc:Vec,
    angle:number,
    radius:number
  }>
  const createShip = ():Body => {
    return {
      id: 'ship',
      viewType: 'ship',
      pos: new Vec(Constants.CanvasSize/2,Constants.CanvasSize-Constants.ShipRadius),
      vel: new Vec(0,0),
      acc: Vec.Zero,
      angle:0,
      radius:Constants.ShipRadius
    }
  }
  const createCircle = (viewType: ViewType)=> (oid:number)=> (radius:number)=> (pos:Vec)=> (vel:Vec) =><Body>{
      pos: pos,
      vel: vel,
      acc: Vec.Zero,
      angle:0,rotation:0,torque:0,
      radius: radius,
      id: viewType+oid,
      viewType: viewType
  }
  const createPlayerBullet = createCircle('pbullet')
  const createEnemyBullet = createCircle('ebullet')

  type State = Readonly<{
    objCount: number
    ship:Body
    playerBullets: ReadonlyArray<Body>
    enemyBullets: ReadonlyArray<Body>
    aliens: ReadonlyArray<Body>
    walls: ReadonlyArray<Body>
    gameOver: boolean
    restartGame: boolean
    exit: ReadonlyArray<Body>
    score: number
    holes: ReadonlyArray<Body>
    level: number
    rng: RNG
    win: boolean
  }>

  const startWalls = [...Array(Constants.StartingWallCount)]
  .map((_,i)=>createCircle("wall")(i)(Constants.WallRadius)(new Vec((i+1)*Constants.CanvasSize/(Constants.StartingWallCount+1),500))(Vec.Zero))
  const startAliens =(r:number,c:number)=> [...Array((r)*(c))]//array of size startaliencount
  .map((_,i)=>createCircle("alien")(i)(Constants.AlienRadius)(new Vec(i%(c)*40+2*Constants.AlienRadius,i%(r)*40+2*Constants.AlienRadius+20))(new Vec(Constants.AlienSpeed,0)))

  const initialState:State = {
    objCount:Constants.StartingAlienColumn*Constants.StartingAlienRow,
    ship: createShip(),
    playerBullets: [],
    enemyBullets: [],
    walls: startWalls,
    gameOver: false,
    restartGame: false,
    exit:[],
    score: 0,
    holes:[],
    level: 1,
    aliens: startAliens(Constants.StartingAlienRow,Constants.StartingAlienColumn),
    rng: new RNG(),
    win: false
  }
  const checkBoundaries = ({x,y}:Vec)=>(b:Body)=>{
    const s = Constants.CanvasSize
    const r = b.radius
    const check = (v:number)=> v<r?r:v>s-r?s-r:v;
    return new Vec(check(x),check(y))
  }
  const moveBody = (s:number)=>(b:Body)  =><Body>{
    ...b,
    pos: checkBoundaries(b.pos.add(b.vel.scale(s)))(b),
    vel: b.vel.add(b.acc)
  }
  const reverseBodyVel = (b:Body) =><Body>{
    ...b,
    vel: b.vel.reflect(),
    pos: new Vec(b.pos.x,b.pos.y+2*Constants.AlienRadius)
  }
  const moveBodyNoBounds = (b:Body)=><Body>{
    ...b,
    pos: b.pos.add(b.vel),
    vel: b.vel.add(b.acc)
  }
  const moveShip = (b:Body): Body =>({
    ...b,
    pos: checkBoundaries(b.pos.add(b.vel))(b),
    // vel: b.vel.x>0?b.vel.sub(new Vec(1,0)):b.vel.x<0?b.vel.add(new Vec(1,0)):b.vel
    vel: b.vel
  })
  const alienShoot = (s:State)=>(b:Body):Body=> 
  createEnemyBullet(s.objCount)
    (Constants.BulletRadius)
    (b.pos.sub(Vec.unitVecInDirection().scale(b.radius)))(Vec.unitVecInDirection().scale(Constants.BulletVelocity).reflect())
  const createHole = (s:State)=>(b:Body):Body =>
  createCircle("hole")(s.objCount)(Constants.HoleRadius)(b.pos)(Vec.Zero)

    const not = <T>(f:(x:T)=>boolean)=> (x:T)=> !f(x)
    const elem = 
    <T>(eq: (_:T)=>(_:T)=>boolean)=> 
      (a:ReadonlyArray<T>)=> 
        (e:T)=> a.findIndex(eq(e)) >= 0
    const except = 
    <T>(eq: (_:T)=>(_:T)=>boolean)=>
      (a:ReadonlyArray<T>)=> 
        (b:ReadonlyArray<T>)=> a.filter(not(elem(eq)(b)))
    function flatMap<T,U>(
      a:ReadonlyArray<T>,
      f:(a:T)=>ReadonlyArray<U>
    ): ReadonlyArray<U> {
      return Array.prototype.concat(...a.map(f));
    }    
  const handleCollisions = (s:State):State=>{
    const
      bodiesCollided = ([a,b]:[Body,Body]) => a.pos.sub(b.pos).len() < a.radius + b.radius,
      aWithinb = ([a,b]:[Body,Body]) => a.pos.sub(b.pos).len() < b.radius,
      //check if alien and playercollided
      shipCollided = s.aliens.filter(a=>bodiesCollided([s.ship,a])).length > 0,
      //check if playerbullet and alien collided
      playerBulletsandAliens = flatMap(s.playerBullets, b=> s.aliens.map(a=>([b,a]))),
      collidedPBandAlien = playerBulletsandAliens.filter(bodiesCollided),
      collidedBullets = collidedPBandAlien.map(([bullet,_])=>bullet),
      collidedAlien = collidedPBandAlien.map(([_,alien])=>alien),

      //check if ship was shot by enemybullet
      shipShot = s.enemyBullets.filter(a=>bodiesCollided([s.ship,a])).length>0,

      //check if anybullet is travelling through a hole
      allBulletsandHole = flatMap(s.playerBullets.concat(s.enemyBullets),b=>s.holes.map(a=>([b,a]))),
      collidedHoleandBullets = allBulletsandHole.filter(aWithinb),
      bulletinHole = collidedHoleandBullets.map(([bullet,_])=>bullet),
      cut = except((a:Body)=>(b:Body)=>a.id === b.id),

      //check if playerbullet and enemybullet hit the wall
      allBulletsandWalls = flatMap(s.playerBullets.concat(s.enemyBullets),b=>s.walls.map(a=>([b,a]))),
      collidedWallandBullets = allBulletsandWalls.filter(bodiesCollided),
      collidedallBullets = cut(collidedWallandBullets.map(([bullet,_])=>bullet))(bulletinHole),

    //When aliens touch the wall, ALL aliens shift down and move opposite direction
      //DID THE ALIEN TOUCH THE WALLS?
      wallTouched = (a:Body)=>a.pos.x==Constants.AlienRadius || a.pos.x ==Constants.CanvasSize-Constants.AlienRadius,
      isAlienTouch = s.aliens.reduce((acc,x)=>acc||wallTouched(x),false),
      newAliens = isAlienTouch? s.aliens.map(reverseBodyVel):s.aliens,
      //DID ANY ALIENS TOUCH THE BOTTOM? TO CHECK FOR GAME OVER
      bottomTouched =(a:Body)=> a.pos.y >= Constants.AlienBoundary-Constants.AlienRadius,
      isAlienAtBottom = s.aliens.reduce((acc,x)=>acc||bottomTouched(x),false),
      newState = collidedallBullets.reduce((a,v)=>({...a,holes:a.holes.concat([createHole(a)(v)]),objCount:a.objCount+1}),s)
    return <State>{
      ...newState,
      playerBullets: cut(s.playerBullets)(collidedBullets.concat(collidedallBullets)),
      enemyBullets: cut(s.enemyBullets)(collidedallBullets),
      aliens: cut(newAliens)(collidedAlien),
      exit: s.exit.concat(collidedAlien,collidedBullets).concat(collidedallBullets),
      gameOver:shipCollided || isAlienAtBottom ||shipShot,
      score: s.score+collidedAlien.length,
    }
  }
  const tick = (s: State, elapsed: number)=>{
    // const advanceRNG = () =>
    // {val:s.rng.nextFloat().val,
    //   next: s.rng.nextFloat().next}
    const newState = elapsed % 10?s:s.aliens
    // .filter(_=>Math.random()<=Constants.ChancetoShoot)
    .reduce((a:State,v:Body)=>({...a,
      rng:a.rng.next(),
      enemyBullets:a.enemyBullets.concat(a.rng.nextFloat()<=Constants.ChancetoShoot?[alienShoot(a)(v)]:[]),
      objCount:a.objCount+ +(a.rng.nextFloat()<=Constants.ChancetoShoot)})
    ,s)
    const
    isCollided = (b:Body)=> (b.pos.y<=b.radius||b.pos.y>=Constants.CanvasSize-b.radius),
    collided:Body[] = (s.playerBullets.filter(isCollided)).concat(s.enemyBullets.filter(isCollided)),
    activeBullets = newState.playerBullets.filter(not(isCollided))
      return handleCollisions(s.gameOver||(s.aliens.length==0 && s.level==Constants.LevelCap)?
        s //if gameover then freeze everything
        :s.aliens.length==0?
        {...initialState,ship:moveShip(s.ship),score:newState.score,level:newState.level+1,exit:s.exit.concat(s.playerBullets).concat(s.enemyBullets).concat(s.holes),aliens: startAliens(Constants.StartingAlienRow*(newState.level+1),Constants.StartingAlienColumn), win:s.level>Constants.LevelCap,rng: newState.rng} //if all aliens died, then new level
        :{...newState, //else, return a newstate with everything proceeding as usual
        ship: moveShip(s.ship),
        playerBullets: activeBullets.map(moveBodyNoBounds),
        enemyBullets:newState.enemyBullets.map(moveBodyNoBounds),
        exit: collided,
        // win:s.level>Constants.LevelCap,
        aliens:s.aliens.length == 1? s.aliens.map(moveBody(3)):s.aliens.map(moveBody(1))})}

    const reduceState = (s:State, e:Shoot|Move|Tick|RestartGame):State =>
      e instanceof Move?{...s, ship: {...s.ship, vel: e.movement}
       }:
      e instanceof Shoot? {...s, 
        playerBullets: s.playerBullets.concat([
          ((unitVec:Vec)=> 
            createPlayerBullet(s.objCount)
              (Constants.BulletRadius)
              (s.ship.pos.add(unitVec.scale(s.ship.radius)))(unitVec.scale(Constants.BulletVelocity)))
              (Vec.unitVecInDirection())]),
        objCount: s.objCount + 1
      }:
      e instanceof RestartGame? ({...initialState,exit:s.exit.concat(s.playerBullets).concat(s.enemyBullets).concat(s.holes).concat(s.aliens)})
      :
      tick(s,e.elapsed)

  function keyboardControl() {
    // get the svg canvas element
    const gameClock = interval(10).pipe(map(e=>new Tick(e)))

    const keyObservable = <T>(e:Event, k: Key, result: () => T) =>
      fromEvent<KeyboardEvent>(document, e)
        .pipe(
          filter(({ code }) => code === k),
          filter(({repeat})=>!repeat),
          map(result));
    
    const  moveLeft = keyObservable('keydown','ArrowLeft',()=>new Move(new Vec(-Constants.ShipSpeed,0)))
    const  moveLeftUp = keyObservable('keyup','ArrowLeft',()=>new Move(Vec.Zero))
    const  moveRight = keyObservable('keydown','ArrowRight',()=>new Move(new Vec(Constants.ShipSpeed,0)))
    const  moveRightUp = keyObservable('keyup','ArrowRight',()=>new Move(Vec.Zero))
    const  shoot = keyObservable('keydown','Space',()=>new Shoot())
    const  restart = keyObservable('keydown','KeyR',()=>new RestartGame())
  
    function updateView(s:State): void {
      const svg = document.getElementById("canvas")!
      const ship = document.getElementById("playerShip")!
      const score = document.getElementById("playerScore")!;
      const level = document.getElementById("level")!;
      score.textContent = s.score.toString();
      level.textContent = s.level.toString();
      // level.textContent =s.rng.nextFloat().toString()
      svg.appendChild(score);
      const g = document.getElementById("gameover")!;
      s.gameOver?g.textContent = "Game Over" :(s.level == Constants.LevelCap && s.aliens.length == 0)?g.textContent = "YOU BEAT THE GAME!!!":g.textContent = ""
      ship.setAttribute('transform',
      `translate(${s.ship.pos.x},${s.ship.pos.y})`)
      const updateBodyView = (b:Body) => {
        function createBodyView() {
          const v = document.createElementNS(svg.namespaceURI, "ellipse")!;
          attr(v,{id:b.id,rx:b.radius,ry:b.radius});
          v.classList.add(b.viewType)
          svg.appendChild(v)
          return v;
        }
      const v = document.getElementById(b.id) || createBodyView();
      attr(v,{cx:b.pos.x,cy:b.pos.y});
      }
      s.playerBullets.forEach(updateBodyView)
      s.enemyBullets.forEach(updateBodyView)
      s.aliens.forEach(updateBodyView)
      s.walls.forEach(updateBodyView)
      s.holes.forEach(updateBodyView)
      s.exit.map(o=>document.getElementById(o.id))
      .filter(isNotNullOrUndefined)
      .forEach(v=>{
        try{svg.removeChild(v)}
        catch(e){
          console.log("Already removed: "+v.id)
        }
      })
  }
function isNotNullOrUndefined<T extends Object>(input: null | undefined | T): input is T {
  return input != null;
}
  const subscription = merge(moveLeft,moveRight,moveLeftUp,moveRightUp,shoot,gameClock,restart)
  .pipe(scan(reduceState,initialState))
  .subscribe(updateView)
 }
 keyboardControl()
}
  
  // the following simply runs your pong function on window load.  Make sure to leave it in place.
  if (typeof window != 'undefined')
    window.onload = ()=>{
      spaceinvaders();
    }
  
  
const attr = (e:Element,o:{[key:string]: number | string,}) =>
{ for(const k in o) e.setAttribute(k,String(o[k])) }