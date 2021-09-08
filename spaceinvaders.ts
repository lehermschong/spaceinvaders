import { concat, from, fromEvent, interval, merge, Observable } from 'rxjs';
import { filter, map, scan, tap, mergeMap, takeUntil, reduce, min } from 'rxjs/operators';
type Key = 'ArrowLeft' | 'ArrowRight' | 'Space' | 'KeyR' | 'KeyI' | 'KeyO' | 'KeyP'
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
      StartingAlienColumn: 23,
      ShipRadius: 10,
      AlienRadius: 6,
      AlienSpeed: 1,
      ChancetoShoot: 0.01,
      StartingWallCount: 5,
      WallRadius: 40,
      AlienBoundary: 420,
      HoleRadius: 10,
      ShipSpeed: 2,
      LevelCap: 5,
      MultiShotCost: 5,
      BuyLifeCost: 4,
      PiercingRoundsCost: 2,
      InitialSeed: Math.random() //The only impure constant used. This is used to generate a random seed which shall be explained later in the RNG class.
    } as const
  type ViewType = 'ship' | 'pbullet' | 'ebullet' | 'alien' | 'wall' | 'hole'
  type PowerUp = 'multishot' | 'addlife' | 'piercingrounds'
  class Tick { constructor(public readonly elapsed: number) { } }
  class Move { constructor(public readonly movement: Vec) { } }
  class Shoot { constructor() { } }
  class RestartGame { constructor() { } }
  class Buy { constructor(public readonly powerUp: PowerUp, public readonly price: number) { } }
  /**
 * An adapted version of the convenient vector class used in the Asteroids game in the course notes of FIT2102.
 * Functions have been adapted, added and removed based on needs. Such as rotate is removed as everything here
 * follows a rather linear trajectory.
 *
 * Partially adapted from: The Asteroids example
 */
  class Vec {
    /**
     * Constructor for a Vec object (which is a vector).
     * @param x Vec's horizontal value
     * @param y Vec's vertical value
     */
    constructor(public readonly x: number = 0, public readonly y: number = 0) { }
    /**
     * Adds another Vec to the current Vec
     * @param b Vec to be added
     * @returns a summed Vec
     */
    readonly add = (b: Vec) => new Vec(this.x + b.x, this.y + b.y)
    /**
     * Subtract a Vec from another vector
     * @param b Vec to be subtarcted
     * @returns a new Vec
     */
    readonly sub = (b: Vec) => this.add(b.scale(-1))
    /**
     * 
     * @param b An adapted version of add that will add as usual, but if it exceeds to higher or lower bounds on the axis, will return the boundary value instead.
     * @returns the appropriate Vec
     */
    readonly boundedAdd = (b: Vec) => (lowerBound: Vec) => (upperBound: Vec) => {
      type Axis = 'x' | 'y'
      const helper_add = (axis: Axis) =>
        Math.max(Math.min(this[axis] + b[axis], upperBound[axis]), lowerBound[axis]);
      return new Vec(helper_add('x'), helper_add('y'))
    }
    /**Calculates the pythagorean distance between the Vec and vec (0,0),
     * However, but subtracting it with another Vec prior, we can calculate distance between two Vecs
     * @returns distance between the Vecs
     */
    readonly len = () => Math.sqrt(this.x * this.x + this.y * this.y)
    /** Scales a Vec by a certain factor
     * 
     * @param s scaling factor
     * @returns a scaled Vec
     */
    readonly scale = (s: number) => new Vec(this.x * s, this.y * s)
    /** Reflects the Vec by negating the x or y axis, depending on what parameter was given.
     * 
     * @param r reflection axis
     * @returns reflected Vec along the axis
     */
    readonly reflect = (r: 'x' | 'y') => new Vec(r === 'x' ? -this.x : this.x, r === 'y' ? -this.y : this.y)
    /**
     * Creates a unit vector in direction (0,-1), 1 unit upwards
     */
    static unitVecInDirection = () => new Vec(0, -1)
    /**
     * Creates a zero Vector (0,0)
     */
    static Zero = new Vec();
  }
  class RNG {
    /**
     * RNG class adapted from observableexamples.ts tutorial. We declare these variables as private and
     * readonly to prevent mutation.
     */
    private static readonly m = 0x80000000; // 2**31
    private static readonly a = 1103515245;
    private static readonly c = 12345;

    /**
     * Constructor for the RNG class.
     * 
     * @param seed the seed for our RNG. This is made readonly to prevent mutation. To prevent gameplay from being repetitive, 
     * we use the random initial seed given. It is important to note that this is IMPURE, but is necessary to make sure gameplay is not the same every playthrough.
     */
    constructor(private readonly seed: number = Constants.InitialSeed) { }

    /**
     * Generates the next random integer along with a new RNG with a different seed. This approach 
     * avoids the need of having a mutable state for our RNG. Since there is no need to use this function, it is made private.
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
    /**Calls the next part of the lazy sequence */
    readonly next = () =>
      new RNG(this.nextInt())

  }
  /**
   * Body class. Everything within this game is considered a body. Note that we place ship upgrades multishot and piercing here.
   * This is such that we do not need to be concerned with this state as we return various new states/initialStates later on.
   */
  type Body = Readonly<{
    id: string, //uniqueid
    viewType: ViewType //viewtype to identify
    pos: Vec, //position vector
    vel: Vec, //velocity vector
    radius: number, //radius of the body
    multishot?: boolean, //whether the multishot is bought, only used for ship.
    piercing?: boolean //whether armor piercing rounds is bought, only used for ship
  }>
  /**
   * Initialises a ship
   * */
  const createShip = (): Body => {
    return {
      id: 'ship',
      viewType: 'ship',
      pos: new Vec(Constants.CanvasSize / 2, Constants.CanvasSize - Constants.ShipRadius), //ship starts in the center
      vel: new Vec(0, 0),
      radius: Constants.ShipRadius,
      multishot: false,
      piercing: false
    }
  },
    /**
     * Creates a circle based on paramater input. In this game, everything is considered a circle and made from createCircle, other than the ship.
     * */
    createCircle = (viewType: ViewType) => (oid: number) => (radius: number) => (pos: Vec) => (vel: Vec) => <Body>{
      pos: pos,
      vel: vel,
      radius: radius,
      id: viewType + oid,
      viewType: viewType,
    },
    /**
     * Using curried functions, we can make helper functions for better code clarity later on by declaring the viewType already.
     */
    createPlayerBullet = createCircle('pbullet'),
    createEnemyBullet = createCircle('ebullet'),
    createHole = (s: State) => (b: Body): Body =>
      createCircle("hole")(s.objCount)(Constants.HoleRadius)(b.pos)(Vec.Zero)
  /**
   * The game state. Everything in this state is used to keep track of the progress of the game.
   * We use this instead of a global mutable state in order to preserve functional purity.
   */
  type State = Readonly<{
    objCount: number //number of objects created so far
    ship: Body
    playerBullets: ReadonlyArray<Body> //playerbullets and enemybullets are separated as they have different interactions
    enemyBullets: ReadonlyArray<Body>
    aliens: ReadonlyArray<Body>
    walls: ReadonlyArray<Body>
    outOfLife: boolean //gameover occurs when the player is out of life
    aliensTouch: boolean //gameover when aliens touch earth
    restartGame: boolean  //signal if the game should be restarted
    exit: ReadonlyArray<Body> //bodies that are to be removed on the current interval tick
    score: number
    holes: ReadonlyArray<Body> //holes on the wall that allow bullets to pass through
    level: number
    rng: RNG
    win: boolean //has the player beat the game?
    life: number
  }>
  /**
   * Function to create some walls/shields
   * @param amount number to create
   * @param size  radius of walls
   * @returns an array of wall bodies
   */
  const startWalls = (amount: number) => (size: number) => [...Array(amount)]
    .map((_, i) => createCircle("wall")(i)(size)(new Vec((i + 1) * Constants.CanvasSize / (amount + 1), 500))(Vec.Zero)),
    /**
     * Function to create the aliens for the game. Note that the values of c and r must be prime, or at least coprime with i value.
     * @param r number of rows of aliens
     * @param c number of columns of aliens
     * @returns an array of alien bodies
     */
    startAliens = (r: number) => (c: number) => [...Array((r) * (c))]//array of size startaliencount
      .map((_, i) => createCircle("alien")(i)(Constants.AlienRadius)(new Vec(i % (c) * Constants.AlienRadius * 3 + 2 * Constants.AlienRadius, i % (r) * Constants.AlienRadius * 3 + 2 * Constants.AlienRadius + 20))(new Vec(Constants.AlienSpeed, 0))),
    /**
     * Initial state of the game, this is the 'default' so to speak.
     */
    initialState: State = {
      objCount: Constants.StartingAlienColumn * Constants.StartingAlienRow,
      ship: createShip(),
      playerBullets: [],
      enemyBullets: [],
      walls: startWalls(Constants.StartingWallCount)(Constants.WallRadius),
      outOfLife: false,
      restartGame: false,
      aliensTouch: false,
      exit: [],
      score: 0,
      holes: [],
      level: 1,
      aliens: startAliens(Constants.StartingAlienRow)(Constants.StartingAlienColumn),
      rng: new RNG(),
      win: false,
      life: 1,
    },
    /**
     * Helper function to check if the boundaries are touching with the body
     * @param {x,y}: a Vec, can be a position or velocity, hence it is separated and we don't use b.vel/b.pos
     * @param b the body which we are checking for
     * @returns a corrected Vec
     */
    checkBoundaries = ({ x, y }: Vec) => (b: Body) => {
      const s = Constants.CanvasSize
      const r = b.radius
      const check = (v: number) => v < r ? r : v > s - r ? s - r : v;
      return new Vec(check(x), check(y))
    },
    /**
     * Helper function to reflect the body when it touches the left/right boundaries
     * @param v an input vec to reflect (or not)
     * @param b body to check
     * @returns a corrected Vec
     */
    reflectBoundaries = (v: Vec) => (b: Body) => {
      const s = Constants.CanvasSize
      const r = b.radius
      return b.pos.x < r || b.pos.x > s - r ? v.reflect('x') : v;
    },
    //for the next few, I chose to keep them separated as they may seem similar, but do vastly different things
    /**
     * moves the body, but if it touches a wall, reflect its velocity.
     */
    moveBodybutReflect = (b: Body) => <Body>{
      ...b,
      vel: reflectBoundaries(b.vel)(b),
      pos: b.pos.add(reflectBoundaries(b.vel)(b))
    },
    //moves a body by adding it's velocity to it's position
    moveBody = (s: number) => (b: Body) => <Body>{
      ...b,
      pos: checkBoundaries(b.pos.add(b.vel.scale(s)))(b),
    },
    //only used for alien movement, when they reach a wall it will shift all aliens down and reflect the velocity. We do not check for
    //the contact of the wall here as ALL aliens (and not just individual aliens) need to change direction and shift downwards simultaneously
    moveAlienAtWall = (b: Body) => <Body>{
      ...b,
      vel: b.vel.reflect('x'),
      pos: new Vec(b.pos.x, b.pos.y + 2 * Constants.AlienRadius)
    },
    alienShoot = (s: State) => (b: Body): Body =>
      createEnemyBullet(s.objCount)
        (Constants.BulletRadius)
        (b.pos.sub(Vec.unitVecInDirection().scale(b.radius)))(Vec.unitVecInDirection().scale(Constants.BulletVelocity).reflect('y')),
    /**
     * negates the boolean value of x mapped on function f. adapted from asteroids.ts
     */
    not = <T>(f: (x: T) => boolean) => (x: T) => !f(x),
    /**
     * checks if element e, is a part of array a. adapted from asteroids.ts
     */
    elem =
      <T>(eq: (_: T) => (_: T) => boolean) =>
        (a: ReadonlyArray<T>) =>
          (e: T) => a.findIndex(eq(e)) >= 0,
    /**
     * by combinating the usage of not and elem, we can return an array of elements from a, that do not appear in b. adapted from asteroids.ts
     */
    except =
      <T>(eq: (_: T) => (_: T) => boolean) =>
        (a: ReadonlyArray<T>) =>
          (b: ReadonlyArray<T>) => a.filter(not(elem(eq)(b))),
    /**
     * Flattens a list and maps function f across it. adapted from asteroids.ts
     */
    flatMap = <T, U>(
      a: ReadonlyArray<T>,
      f: (a: T) => ReadonlyArray<U>
    ): ReadonlyArray<U> => Array.prototype.concat(...a.map(f)),

    /**
     * Function that handles the collisions of various bodies in this game
     * @param s the state
     * @returns a new state that is modified based on the collision logic
     */
    handleCollisions = (s: State): State => {
      const
        /**
         * checks if body a and body b have collided. This is done by checking that their distance is shorter than the sums of radii.
         */
        bodiesCollided = ([a, b]: [Body, Body]) => a.pos.sub(b.pos).len() < a.radius + b.radius,
        /**
         * Checks if body a is within body b. This is done by checking that their distance is shorter than the radius of b (the containing object)
         */
        aWithinb = ([a, b]: [Body, Body]) => a.pos.sub(b.pos).len() < b.radius,
        //check if alien and playercollided
        //check if playerbullet and alien collided
        playerBulletsandAliens = flatMap(s.playerBullets, b => s.aliens.map(a => ([b, a]))), //an array of tuples [bullet,alien]
        collidedPBandAlien = playerBulletsandAliens.filter(bodiesCollided), //only want the bullets and aliens that collided
        collidedBullets = s.ship.piercing ? [] : collidedPBandAlien.map(([bullet, _]) => bullet), //if piercing was bought, no bullets are considered to be *collided*
        collidedAlien = collidedPBandAlien.map(([_, alien]) => alien),

        //check if ship was shot by enemybullet
        shipShot = s.enemyBullets.filter(a => bodiesCollided([s.ship, a])).length > 0, //if the list of bullets that collided with ship >0, ship is shot.
        shipShotBullets = s.enemyBullets.filter(a => bodiesCollided([s.ship, a])),

        //check if anybullet is travelling through a hole
        allBulletsandHole = flatMap(s.playerBullets.concat(s.enemyBullets), b => s.holes.map(a => ([b, a]))), //checks for all player and enemy bullets
        collidedHoleandBullets = allBulletsandHole.filter(aWithinb), //tuple of [bullet,hole] that bullet is in hole.
        bulletinHole = collidedHoleandBullets.map(([bullet, _]) => bullet),
        /**
         * Important helper function. Used to remove all elements of b that are present in a. Adapted from asteroids.ts.
         */
        cut = except((a: Body) => (b: Body) => a.id === b.id),

        //check if playerbullet and enemybullet hit the wall
        allBulletsandWalls = flatMap(s.playerBullets.concat(s.enemyBullets), b => s.walls.map(a => ([b, a]))),
        collidedWallandBullets = allBulletsandWalls.filter(bodiesCollided), //filters the bullets that collided with walls
        collidedallBullets = cut(collidedWallandBullets.map(([bullet, _]) => bullet))(bulletinHole), //we cut the bullets that touched the walls, but are still within holes.

        //When aliens touch the wall, ALL aliens shift down and move opposite direction
        //DID THE ALIEN TOUCH THE WALLS?
        wallTouched = (a: Body) => a.pos.x == Constants.AlienRadius || a.pos.x == Constants.CanvasSize - Constants.AlienRadius,
        isAlienTouch = s.aliens.reduce((acc, x) => acc || wallTouched(x), false),
        newAliens = isAlienTouch ? s.aliens.map(moveAlienAtWall) : s.aliens, //we need to replace ALL aliens and reflect ALL their velocities
        //DID ANY ALIENS TOUCH THE BOTTOM? TO CHECK FOR GAME OVER
        bottomTouched = (a: Body) => a.pos.y >= Constants.AlienBoundary - Constants.AlienRadius,
        isAlienAtBottom = s.aliens.reduce((acc, x) => acc || bottomTouched(x), false),
        //we create a new state that would keep track of each bullet that touched a wall, and make a hole there.
        newState = collidedallBullets.reduce((a, v) => ({ ...a, holes: a.holes.concat([createHole(a)(v)]), objCount: a.objCount + 1 }), s)
      return <State>{
        ...newState,
        playerBullets: cut(newState.playerBullets)(collidedBullets.concat(collidedallBullets)), //remove all bullets that collided with alien, or wall but not in hole
        enemyBullets: cut(newState.enemyBullets)(collidedallBullets.concat(shipShotBullets)), //removes all bullets that collided with walls or the ship
        aliens: cut(newAliens)(collidedAlien), //removes all aliens that were hit
        exit: newState.exit.concat(collidedAlien, collidedBullets, collidedallBullets, shipShotBullets), //so that updateView would remove these things, we mark them by placing them in 'exit'
        //update life, score and check for gameOver condition
        life: newState.life - +shipShot,
        outOfLife: newState.life <= 0, //note that since tick checks dynamically, we can add a life to cancel gameOver, thus resuming the game!
        aliensTouch: isAlienAtBottom, //however, if the aliens touch the bottom, we can't resume even if we add lives
        score: newState.score + collidedAlien.length,
      }
    },
    /**
     * Essential tick function. Handles the game state functionality at every tick interval. Adapted from asteroids.ts.
     */
    tick = (s: State, elapsed: number) => {
      //returns a new state, that would update the aliens and each time they fired. We do this as we need to call State.rng.next() each time in the reduce.
      const newState = elapsed % 10 ? s : s.aliens
        .reduce((a: State, v: Body) => ({
          ...a,
          rng: a.rng.next(),
          enemyBullets: a.enemyBullets.concat(a.rng.nextFloat() <= Constants.ChancetoShoot ? [alienShoot(a)(v)] : []), //if the number rolled is lower than threshold chance, fire!
          objCount: a.objCount + +(a.rng.nextFloat() <= Constants.ChancetoShoot) //update count each time
        })
          , s),
        isCollided = (b: Body) => (b.pos.y <= b.radius || b.pos.y >= Constants.CanvasSize - b.radius), //function to check if the body collided with the top of canvas
        collided = (s.playerBullets.filter(isCollided)).concat(s.enemyBullets.filter(isCollided)), //mainly to prevent lag
        activeBullets = newState.playerBullets.filter(not(isCollided)) //we will remove these bullets
      return handleCollisions(s.outOfLife || s.aliensTouch || (s.aliens.length == 0 && s.level == Constants.LevelCap) ?
        s //if gameover then freeze everything
        : s.aliens.length == 0 ? //if all aliens killed, but it isnt last level, go next
          {
            ...s,
            ship: moveBody(1)(s.ship),
            score: s.score,
            level: s.level + 1,
            holes: [],
            playerBullets: [],
            enemyBullets: [],
            exit: s.exit.concat(s.playerBullets).concat(s.enemyBullets).concat(s.holes),
            aliens: startAliens(Constants.StartingAlienRow * (s.level + 1))(Constants.StartingAlienColumn),
            win: s.level > Constants.LevelCap, rng: newState.rng,
          } //else, proceed with the tick as usual
          : {
            ...newState, //else, return a newstate with everything proceeding as usual
            ship: moveBody(1)(s.ship),
            playerBullets: activeBullets.map(moveBodybutReflect),
            enemyBullets: newState.enemyBullets.map(moveBodybutReflect),
            exit: collided,
            // win:s.level>Constants.LevelCap,
            aliens: s.aliens.length == 1 ? s.aliens.map(moveBody(3)) : s.aliens.map(moveBody(1)) //lone survivor gets tripled speed!!!
          })
    }
  /**
   * Somewhat a reduce function that accumulates all new changes and transformations to the state of the game and updates it.
   * @param s previous state of the game
   * @param e external instruction issued by user to alter the game
   * @returns a new, modified state to reflect a new game state
   */
  const reduceState = (s: State, e: Shoot | Move | Tick | RestartGame | Buy): State =>
    e instanceof Move ? {// if it is move, add the movement value to the ship's velocity
      ...s, ship: { ...s.ship, vel: s.ship.vel.add(e.movement) }
    } :
      e instanceof Shoot ? { //if it was shoot
        ...s,
        playerBullets: s.ship.multishot ? s.playerBullets.concat([ //and multishot active, append 3 bullets
          ((unitVec: Vec) => //perpendicular bullet
            createPlayerBullet(s.objCount)
              (Constants.BulletRadius)
              (s.ship.pos.add(unitVec.scale(s.ship.radius)))(unitVec.scale(Constants.BulletVelocity)))
            (Vec.unitVecInDirection())], [
          ((unitVec: Vec) =>  //45 degrees to left
            createPlayerBullet(s.objCount + 1)
              (Constants.BulletRadius)
              (s.ship.pos.add(unitVec.scale(s.ship.radius)))(new Vec(1, -1).scale(Constants.BulletVelocity)))
            (Vec.unitVecInDirection())], [
          ((unitVec: Vec) =>  //45 degrees to right
            createPlayerBullet(s.objCount + 2)
              (Constants.BulletRadius)
              (s.ship.pos.add(unitVec.scale(s.ship.radius)))(new Vec(-1, -1).scale(Constants.BulletVelocity)))
            (Vec.unitVecInDirection())])
          : s.playerBullets.concat([// else just append one bullet
            ((unitVec: Vec) =>
              createPlayerBullet(s.objCount)
                (Constants.BulletRadius)
                (s.ship.pos.add(unitVec.scale(s.ship.radius)))(unitVec.scale(Constants.BulletVelocity)))
              (Vec.unitVecInDirection())]),
        objCount: s.objCount + (s.ship.multishot ? 3 : 1)
      } :
        e instanceof RestartGame ? //if we need to restart the game, we set the state back to the initial state, but also fling all bullets, holes and preexisting aliens to be removed by the canvas.
          ({ ...initialState, exit: s.exit.concat(s.playerBullets).concat(s.enemyBullets).concat(s.holes).concat(s.aliens) })
          :
          e instanceof Buy ? { //if e was buy, we alter the state, and work out the boolean logic based on what was bought
            ...s,
            ship: {
              ...s.ship,
              multishot: (e.powerUp == 'multishot' && s.score >= e.price) || s.ship.multishot, //if either multishot was already on, or we can afford it
              piercing: (e.powerUp == 'piercingrounds' && s.score >= e.price) || s.ship.piercing //same as above, for piercing
            },
            life: e.powerUp == 'addlife' && s.score >= e.price ? s.life + 1 : s.life, //buys a life
            score: s.score >= e.price || //if we can afford it
              (e.powerUp == 'multishot' && !s.ship.multishot) || //if we want to buy multishot but already have it
              (e.powerUp == 'piercingrounds' && !s.ship.piercing) //if we want piercing but already have it
              ? s.score - e.price : s.score //minus score for amount we bought
          } :
            tick(s, e.elapsed), //else tick and proceed as usual

    /**
     * Function that in general handles all forms of keyboard inputs
     */
    keyboardControl = () => {
      // get the svg canvas element
      const gameClock = interval(10).pipe(map(e => new Tick(e)))
      /**
       * helper function that just takes in the key and make sure it isn't a repeat.
       * @param e type of keyboard event
       * @param k key pressed
       * @param result a function that causes a certain result to happen
       * @returns an observable stream of the type 'result' 
       */
      const keyObservable = <T>(e: Event, k: Key, result: () => T): Observable<T> =>
        fromEvent<KeyboardEvent>(document, e)
          .pipe(
            filter(({ code }) => code === k),
            filter(({ repeat }) => !repeat),
            map(result));

      const moveLeft = keyObservable('keydown', 'ArrowLeft', () => new Move(new Vec(-Constants.ShipSpeed, 0))),
        moveLeftUp = keyObservable('keyup', 'ArrowLeft', () => new Move(new Vec(Constants.ShipSpeed, 0))),
        moveRight = keyObservable('keydown', 'ArrowRight', () => new Move(new Vec(Constants.ShipSpeed, 0))),
        moveRightUp = keyObservable('keyup', 'ArrowRight', () => new Move(new Vec(-Constants.ShipSpeed, 0))),
        shoot = keyObservable('keydown', 'Space', () => new Shoot()),
        restart = keyObservable('keydown', 'KeyR', () => new RestartGame()),
        buyPiercingRounds = keyObservable('keydown', 'KeyI', () => new Buy('piercingrounds', Constants.PiercingRoundsCost)),
        buyMultiShot = keyObservable('keydown', 'KeyO', () => new Buy('multishot', Constants.MultiShotCost)),
        buyMoreLife = keyObservable('keydown', 'KeyP', () => new Buy('addlife', Constants.BuyLifeCost))
      function isNotNullOrUndefined<T extends Object>(input: null | undefined | T): input is T {
        return input != null;
      }
      const subscription = merge(moveLeft, moveRight, moveLeftUp, moveRightUp, shoot, gameClock, restart, buyMultiShot, buyMoreLife, buyPiercingRounds)
        .pipe(scan(reduceState, initialState))
        .subscribe(updateView)
      /**
       * Updates the document according to the state of the game. This is how all our computations get
       * displayed to the html. Due to the interaction with svg state, this is impure.
       * @param s the state of the game
       */
      function updateView(s: State): void {
        const svg = document.getElementById("canvas")!
        const ship = document.getElementById("playerShip")!
        const score = document.getElementById("playerScore")!;
        const level = document.getElementById("level")!;
        const lives = document.getElementById("lives")!;
        const upgrades = document.getElementById("upgrades")!;
        score.textContent = "Score: " + s.score.toString();
        level.textContent = "Level: " + s.level.toString();
        lives.textContent = "Lives: " + s.life.toString();
        upgrades.textContent = "Upgrades: " + (s.ship.multishot ? "multishot " : " ") + (s.ship.piercing ? "piercing " : " ") //display what upgrades have been bought
        const g = document.getElementById("gameover")!;
        s.outOfLife && s.score >= Constants.BuyLifeCost ? //if the user still has enough points to buy a life, when at 0 life
          g.textContent = "Buy Life 'P' to Resume!"
          : s.outOfLife && s.score < Constants.BuyLifeCost || s.aliensTouch ? //else if the user has not enough points, or aliens touchdown the bottom, game over
            g.textContent = "GAME OVER!"
            : (s.level == Constants.LevelCap && s.aliens.length == 0) ? //if the user managed to beat the final level at the cap, win the game
              g.textContent = "YOU BEAT THE GAME!!!" : g.textContent = ""
        ship.setAttribute('transform',
          `translate(${s.ship.pos.x},${s.ship.pos.y})`) //alters the ship's position at every tick based on the state
        /**
         * Helper function to set the attributes for an element. Obtained from asteroids.ts.
         * @param e SVG view element to be updated
         * @param o the attribute that we need to update, usually in the form of an attribute key(string) that contains a modifier value (number or string)
         */
        const attr = (e: Element)=>(o: { [key: string]: number | string, }) => { for (const k in o) e.setAttribute(k, String(o[k])) }
        /**
         * Helper function to update each body in the view. This is meant to create/remove an svg element for the body.
         * Partially adapted from asteroids.ts.
         * @param b the body to be examined
         */
        const updateBodyView = (b: Body) => {
          function createBodyView() { //helper function to create a circle for each SVG element, EVERYTHING IS CIRCLES!!!
            const v = document.createElementNS(svg.namespaceURI, "ellipse")!;
            attr(v)({id: b.id, rx: b.radius, ry: b.radius });
            v.classList.add(b.viewType)
            svg.appendChild(v)
            return v;
          }
          const v = document.getElementById(b.id) || createBodyView();
          attr(v)({ cx: b.pos.x, cy: b.pos.y });
        }
        //updates the bodyview for each of the following: holes, player/enemybullets,aliens,walls
        s.holes.forEach(updateBodyView)
        s.playerBullets.forEach(updateBodyView)
        s.enemyBullets.forEach(updateBodyView)
        s.aliens.forEach(updateBodyView)
        s.walls.forEach(updateBodyView)
        //for each exiting element we will remove their svg element
        s.exit.map(o => document.getElementById(o.id))
          .filter(isNotNullOrUndefined)
          .forEach(v => {
            try { svg.removeChild(v) } //rare instances where two things would be removed in the same tick and result in a crash
            catch (e) {
              console.log("Already removed: " + v.id)
            }
          })
      }
    }
  keyboardControl()//calls the function to run the game
}

// the following simply runs your pong function on window load.  Make sure to leave it in place.
if (typeof window != 'undefined')
  window.onload = () => {
    spaceinvaders();
  }

