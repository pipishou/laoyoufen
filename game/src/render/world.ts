import Phaser from "phaser";
import { CUSTOMER_ARCHETYPES } from "../data/customers";
import { SimClock } from "../sim/clock";
import type { GameState } from "../sim/state";
import { PALETTE, TILE, VIEW_H, VIEW_W, toPhaserColor } from "./palette";

export interface WorldSceneData {
  /** 每过一「分钟」回调一次，由 main 转给模拟层 */
  onMinute: () => void;
  /** 倍速：1/4/8/16，由 HUD 控制 */
  getSpeed?: () => number;
  /** 取当前局面：场景只读，不改状态。缺省时退化成空场景 */
  getState?: () => GameState | null;
}

const WALK_SPEED = 72;
const PLAYER_W = 16;
const PLAYER_H = 24;

/** 走路循环帧数。4 帧 = 左右脚各迈一次，6-8fps 是开罗式的「笨拙小碎步」[COMMON, MED] */
const PERSON_FRAMES = 4;
const WALK_FPS = 7;
const PERSON_TEX_H = 20;
/** 四帧里左右脚的横向摆动：0 并拢 → 左脚前 → 并拢 → 右脚前 */
const WALK_SWING = [0, -1, 0, 1] as const;

/** 店内可用区（逻辑像素）：左右让开 HUD 侧栏，上下让开顶栏/底栏 */
const ROOM = { x0: 96, x1: 416, wallTop: 26, wallBottom: 92 };
const COUNTER = { x0: 116, x1: 396, y0: 92, y1: 108 };
const DOOR = { x: 100, y: 258 };
const QUEUE = { x: 146, y: 258, step: 22 };
const SEAT_Y = [140, 200] as const;
const SEAT_GAP = 64;
const CUSTOMER_SPEED = 58;

const ARCHETYPE_INDEX = new Map(CUSTOMER_ARCHETYPES.map((c, i) => [c.id, i]));

const BODY_COLORS = [0x3f8bc9, 0x5fa34f, 0xd05b4f, 0xf2a33c, 0x7fa650, 0xb8b3a6, 0x8a5a3b, 0xc8442f];
const HAIR_COLORS = [0x3b2b1d, 0x4a3324, 0x2b2118];

interface SeatPoint {
  x: number;
  y: number;
}

interface Actor {
  img: Phaser.GameObjects.Sprite;
  /** 贴图前缀，如 cust-3；走路动画键是 walk-<前缀> */
  tex: string;
  /** 占的座位号，-1 = 没座（排队中） */
  seat: number;
  tx: number;
  ty: number;
  leaving: boolean;
}

/** 座位坐标表。1-4 人一排，5-8 人两排，永远居中 */
function seatPoints(n: number): SeatPoint[] {
  const size = Math.max(0, Math.min(8, Math.floor(n)));
  if (size === 0) return [];
  const rows = size <= 4 ? 1 : 2;
  const cols = Math.ceil(size / rows);
  const out: SeatPoint[] = [];
  for (let r = 0; r < rows; r++) {
    const count = r === 0 ? cols : size - cols;
    for (let c = 0; c < count; c++) {
      out.push({
        x: 256 + (c - (count - 1) / 2) * SEAT_GAP,
        y: SEAT_Y[r] ?? SEAT_Y[0],
      });
    }
  }
  return out;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function mixColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  return (Math.round(lerp(ar, br, t)) << 16) | (Math.round(lerp(ag, bg, t)) << 8) | Math.round(lerp(ab, bb, t));
}

/**
 * 店内场景：墙 + 柜台 + 灶 + 桌椅 + 门，顾客按模拟层状态走位。
 * 所有图形都由代码生成，B6 接正式美术时整体替换。
 */
export class WorldScene extends Phaser.Scene {
  private onMinute: () => void = () => {};
  private getSpeed: () => number = () => 1;
  private getState: () => GameState | null = () => null;
  private readonly clock = new SimClock();

  private player!: Phaser.GameObjects.Sprite;
  private ground!: Phaser.GameObjects.Graphics;
  private ambient!: Phaser.GameObjects.Rectangle;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<"up" | "down" | "left" | "right", Phaser.Input.Keyboard.Key>;

  private readonly actors = new Map<number, Actor>();
  private bowls: Phaser.GameObjects.Image[] = [];
  private staffSprites: Phaser.GameObjects.Sprite[] = [];
  private staffSig = "";
  private shopSig = "";
  private steams: Phaser.GameObjects.Arc[] = [];

  constructor() {
    super("world");
  }

  init(data: WorldSceneData): void {
    this.onMinute = data.onMinute;
    this.getSpeed = data.getSpeed ?? (() => 1);
    this.getState = data.getState ?? (() => null);
  }

  create(): void {
    this.buildFloorTexture();
    this.buildPlayerFrames();
    for (let i = 0; i < CUSTOMER_ARCHETYPES.length; i++) {
      this.buildPersonFrames(`cust-${i}`, BODY_COLORS[i % BODY_COLORS.length]!, HAIR_COLORS[i % HAIR_COLORS.length]!);
    }
    this.buildStaffFrames();
    this.ensureAnim("idle-staff", ["staff-f0", "staff-f2"], 2, -1);
    this.buildBowlTexture();

    this.add.tileSprite(0, 0, VIEW_W, VIEW_H, "floor").setOrigin(0, 0).setDepth(0);

    this.ground = this.add.graphics().setDepth(2);

    this.player = this.add.sprite(352, 248, "player-f0").setOrigin(0.5, 1).setDepth(248);

    this.ambient = this.add
      .rectangle(VIEW_W / 2, VIEW_H / 2, VIEW_W, VIEW_H, 0xffffff, 0)
      .setDepth(900);

    const kb = this.input.keyboard;
    if (kb) {
      this.cursors = kb.createCursorKeys();
      this.wasd = kb.addKeys({
        up: Phaser.Input.Keyboard.KeyCodes.W,
        down: Phaser.Input.Keyboard.KeyCodes.S,
        left: Phaser.Input.Keyboard.KeyCodes.A,
        right: Phaser.Input.Keyboard.KeyCodes.D,
      }) as Record<"up" | "down" | "left" | "right", Phaser.Input.Keyboard.Key>;
    }

    const st = this.getState();
    if (st) this.redrawShop(st);
  }

  update(_time: number, delta: number): void {
    this.movePlayer(delta);

    const st = this.getState();
    if (st) {
      const dt = Math.min(delta, 250);
      this.syncShop(st);
      this.syncActors(st, dt);
      this.syncStaff(st);
      this.syncAmbient(st);
    }

    const minutes = this.clock.push(delta * this.getSpeed());
    for (let i = 0; i < minutes; i++) this.onMinute();
  }

  /* ---------------- 场景静态部分 ---------------- */

  private syncShop(st: GameState): void {
    const sig = [
      st.venue.seats,
      st.venue.stoves,
      st.venue.upgrades.sign ?? 0,
      st.venue.upgrades.ac ?? 0,
      st.venue.upgrades.decor ?? 0,
      st.venue.upgrades.hall ?? 0,
    ].join("/");
    if (sig === this.shopSig) return;
    this.shopSig = sig;
    this.redrawShop(st);
  }

  private redrawShop(st: GameState): void {
    const g = this.ground;
    const ink = toPhaserColor(PALETTE.ink);
    const paper = toPhaserColor(PALETTE.paper);
    const paperDark = toPhaserColor(PALETTE.paperDark);
    const wood = toPhaserColor(PALETTE.wood);
    const brick = toPhaserColor(PALETTE.brick);
    const mustard = toPhaserColor(PALETTE.mustard);

    g.clear();

    // 店内地面：比外面亮一档，地砖缝
    g.fillStyle(paper, 1);
    g.fillRect(ROOM.x0, ROOM.wallTop, ROOM.x1 - ROOM.x0, VIEW_H - ROOM.wallTop);
    g.lineStyle(2, paperDark, 1);
    for (let x = ROOM.x0; x <= ROOM.x1; x += TILE) g.lineBetween(x, ROOM.wallTop, x, VIEW_H);
    for (let y = ROOM.wallTop; y <= VIEW_H; y += TILE) g.lineBetween(ROOM.x0, y, ROOM.x1, y);

    // 后墙
    g.fillStyle(paperDark, 1);
    g.fillRect(ROOM.x0, ROOM.wallTop, ROOM.x1 - ROOM.x0, ROOM.wallBottom - ROOM.wallTop);
    g.fillStyle(wood, 1);
    g.fillRect(ROOM.x0, ROOM.wallBottom - 6, ROOM.x1 - ROOM.x0, 6);
    g.lineStyle(2, ink, 1);
    g.strokeRect(ROOM.x0, ROOM.wallTop, ROOM.x1 - ROOM.x0, ROOM.wallBottom - ROOM.wallTop);

    // 招牌：等级越高越宽
    const signLv = st.venue.upgrades.sign ?? 0;
    const signW = 92 + signLv * 14;
    const signX = 208 - signW / 2;
    g.fillStyle(brick, 1);
    g.fillRect(signX, 34, signW, 22);
    g.lineStyle(2, ink, 1);
    g.strokeRect(signX, 34, signW, 22);
    g.fillStyle(mustard, 1);
    for (let i = 0; i < 4 + signLv; i++) {
      g.fillRect(signX + 10 + i * 14, 42, 8, 6);
    }

    // 空调：避开右上角的悬浮评分卡
    const acLv = st.venue.upgrades.ac ?? 0;
    if (acLv > 0) {
      g.fillStyle(toPhaserColor(PALETTE.concrete), 1);
      g.fillRect(356, 72, 34, 16);
      g.lineStyle(2, ink, 1);
      g.strokeRect(356, 72, 34, 16);
      g.lineStyle(1, ink, 1);
      for (let i = 0; i < acLv; i++) g.lineBetween(360, 76 + i * 4, 386, 76 + i * 4);
    }

    // 摆件：靠左墙码放
    const decorLv = st.venue.upgrades.decor ?? 0;
    for (let i = 0; i < decorLv; i++) {
      const px = ROOM.x0 + 8 + (i % 3) * 14;
      const py = 62 + Math.floor(i / 3) * 14;
      g.fillStyle(toPhaserColor(PALETTE.bamboo), 1);
      g.fillRect(px, py, 12, 10);
      g.fillStyle(toPhaserColor(PALETTE.douchi), 1);
      g.fillRect(px + 4, py + 10, 4, 6);
    }

    // 左右墙柱，左侧留门洞（门外是天光）
    g.fillStyle(toPhaserColor(PALETTE.sky), 1);
    g.fillRect(ROOM.x0, DOOR.y - 34, 6, 52);
    g.fillStyle(wood, 1);
    g.fillRect(ROOM.x0, ROOM.wallBottom, 6, DOOR.y - 34 - ROOM.wallBottom);
    g.fillRect(ROOM.x0, DOOR.y + 18, 6, VIEW_H - (DOOR.y + 18));
    g.fillRect(ROOM.x1 - 6, ROOM.wallBottom, 6, VIEW_H - ROOM.wallBottom);
    g.lineStyle(2, ink, 1);
    g.strokeRect(ROOM.x0 - 1, DOOR.y - 34, 8, 52);

    // 柜台
    g.fillStyle(wood, 1);
    g.fillRect(COUNTER.x0, COUNTER.y0, COUNTER.x1 - COUNTER.x0, COUNTER.y1 - COUNTER.y0);
    g.lineStyle(2, ink, 1);
    g.strokeRect(COUNTER.x0, COUNTER.y0, COUNTER.x1 - COUNTER.x0, COUNTER.y1 - COUNTER.y0);
    g.fillStyle(toPhaserColor(PALETTE.paperDark), 1);
    g.fillRect(COUNTER.x0, COUNTER.y0, COUNTER.x1 - COUNTER.x0, 4);

    // 灶：数量随扩建增长，锅口冒热气
    for (const s of this.steams) s.destroy();
    this.steams = [];
    const stoves = Math.max(1, st.venue.stoves);
    for (let i = 0; i < stoves; i++) {
      const cx = COUNTER.x0 + 26 + i * 34;
      const cy = COUNTER.y0 + 4;
      g.fillStyle(toPhaserColor(PALETTE.concrete), 1);
      g.fillRect(cx - 11, cy - 8, 22, 12);
      g.lineStyle(2, ink, 1);
      g.strokeRect(cx - 11, cy - 8, 22, 12);
      g.fillStyle(toPhaserColor(PALETTE.ink), 1);
      g.fillRect(cx - 8, cy - 6, 16, 3);
      const steam = this.add.circle(cx, cy - 14, 4, 0xffffff, 0.55).setDepth(COUNTER.y0 + 1);
      this.steams.push(steam);
      this.tweens.add({
        targets: steam,
        y: cy - 30,
        alpha: 0,
        duration: 1600 + i * 180,
        repeat: -1,
        delay: i * 400,
      });
    }

    // 桌椅
    const seats = seatPoints(st.venue.seats);
    for (const b of this.bowls) b.destroy();
    this.bowls = [];
    for (const p of seats) {
      // 凳脚
      g.fillStyle(toPhaserColor(PALETTE.ink), 1);
      g.fillRect(p.x - 13, p.y + 19, 3, 4);
      g.fillRect(p.x + 10, p.y + 19, 3, 4);
      // 桌板
      g.fillStyle(wood, 1);
      g.fillRect(p.x - 15, p.y + 6, 30, 14);
      g.lineStyle(2, ink, 1);
      g.strokeRect(p.x - 15, p.y + 6, 30, 14);
      g.fillStyle(toPhaserColor(PALETTE.paperDark), 1);
      g.fillRect(p.x - 15, p.y + 6, 30, 3);
      // 凳面
      g.fillStyle(toPhaserColor(PALETTE.warmOrange), 1);
      g.fillRect(p.x - 6, p.y + 21, 12, 4);
      g.lineStyle(1, ink, 1);
      g.strokeRect(p.x - 6, p.y + 21, 12, 4);
      const bowl = this.add.image(p.x, p.y + 9, "bowl").setOrigin(0.5, 1).setDepth(p.y + 20).setVisible(false);
      this.bowls.push(bowl);
    }

    // 候餐区地垫
    g.fillStyle(paperDark, 1);
    g.fillRect(QUEUE.x - 8, QUEUE.y - 4, QUEUE.step * 8 + 8, 24);
    g.lineStyle(2, ink, 1);
    g.strokeRect(QUEUE.x - 8, QUEUE.y - 4, QUEUE.step * 8 + 8, 24);
  }

  /* ---------------- 顾客 ---------------- */

  private syncActors(st: GameState, delta: number): void {
    const seats = seatPoints(st.venue.seats);
    const claimed = new Set<number>();
    let nextFree = 0;
    const seen = new Set<number>();
    let waitIdx = 0;

    for (const c of st.flow.customers) {
      seen.add(c.id);
      let a = this.actors.get(c.id);
      if (!a) {
        const idx = ARCHETYPE_INDEX.get(c.archetypeId) ?? 0;
        const tex = `cust-${idx}`;
        const img = this.add.sprite(DOOR.x - 6, DOOR.y, `${tex}-f0`).setOrigin(0.5, 1);
        a = { img, tex, seat: -1, tx: DOOR.x, ty: DOOR.y, leaving: false };
        a.img.setDepth(DOOR.y);
        this.actors.set(c.id, a);
      }

      if (c.status === "eating") {
        if (a.seat < 0 || a.seat >= seats.length || claimed.has(a.seat)) {
          while (nextFree < seats.length && claimed.has(nextFree)) nextFree++;
          a.seat = nextFree < seats.length ? nextFree : -1;
        }
        if (a.seat >= 0) {
          claimed.add(a.seat);
          const p = seats[a.seat]!;
          a.tx = p.x;
          a.ty = p.y;
        } else {
          a.tx = 256;
          a.ty = 232;
        }
      } else {
        a.seat = -1;
        a.tx = QUEUE.x + waitIdx * QUEUE.step;
        a.ty = QUEUE.y;
        waitIdx += 1;
      }
    }

    // 已结账离场：走到门口再销毁
    for (const [id, a] of this.actors) {
      if (seen.has(id)) continue;
      a.leaving = true;
      a.seat = -1;
      a.tx = DOOR.x - 24;
      a.ty = DOOR.y;
      if (Math.abs(a.img.x - a.tx) < 4) {
        a.img.destroy();
        this.actors.delete(id);
      }
    }

    const step = (CUSTOMER_SPEED * delta) / 1000;
    for (const a of this.actors.values()) {
      const dx = a.tx - a.img.x;
      const dy = a.ty - a.img.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.6) {
        const s = Math.min(dist, step);
        a.img.x += (dx / dist) * s;
        a.img.y += (dy / dist) * s;
        if (Math.abs(dx) > 0.8) a.img.setFlipX(dx < 0);
        if (!a.img.anims.isPlaying) a.img.play(`walk-${a.tex}`);
      } else if (a.img.anims.isPlaying) {
        a.img.anims.stop();
        a.img.setTexture(`${a.tex}-f0`);
      }
      a.img.setDepth(a.img.y);
    }

    // 碗：只有坐下的人桌上有
    for (let i = 0; i < this.bowls.length; i++) {
      this.bowls[i]!.setVisible(claimed.has(i));
    }
  }

  private syncStaff(st: GameState): void {
    const sig = st.staff.roster.map((m) => `${m.uid}:${m.role}`).join(",");
    if (sig === this.staffSig) return;
    this.staffSig = sig;
    for (const s of this.staffSprites) s.destroy();
    this.staffSprites = [];

    let cookSlot = 0;
    let prepSlot = 0;
    let serverSlot = 0;
    for (const m of st.staff.roster) {
      let x = 0;
      let y = 0;
      if (m.role === "cook") {
        x = 200 + cookSlot * 30;
        y = 106;
        cookSlot += 1;
      } else if (m.role === "prep") {
        x = 320 + prepSlot * 26;
        y = 106;
        prepSlot += 1;
      } else {
        x = 150 + serverSlot * 26;
        y = 268;
        serverSlot += 1;
      }
      const img = this.add.sprite(x, y, "staff-f0").setOrigin(0.5, 1).setDepth(y);
      img.play("idle-staff");
      this.staffSprites.push(img);
    }
  }

  /** 一天四个时段的色温：早暖、午白、傍晚橘、夜里蓝 */
  private syncAmbient(st: GameState): void {
    const t = Math.min(1, Math.max(0, st.flow.minuteOfDay / 120));
    const keys: Array<{ t: number; c: number; a: number }> = [
      { t: 0, c: 0xff9a5a, a: 0.16 },
      { t: 0.22, c: 0xffffff, a: 0 },
      { t: 0.5, c: 0xffe0b0, a: 0.06 },
      { t: 0.75, c: 0xff8a4a, a: 0.18 },
      { t: 0.88, c: 0x24365e, a: 0.3 },
      { t: 1, c: 0xff9a5a, a: 0.16 },
    ];
    let i = 0;
    while (i < keys.length - 2 && t > keys[i + 1]!.t) i++;
    const a = keys[i]!;
    const b = keys[i + 1]!;
    const k = Math.min(1, Math.max(0, (t - a.t) / Math.max(0.0001, b.t - a.t)));
    this.ambient.setFillStyle(mixColor(a.c, b.c, k), lerp(a.a, b.a, k));
  }

  /* ---------------- 玩家 ---------------- */

  private movePlayer(delta: number): void {
    if (!this.cursors) return;
    let vx = 0;
    let vy = 0;
    if (this.cursors.left.isDown || this.wasd.left.isDown) vx -= 1;
    if (this.cursors.right.isDown || this.wasd.right.isDown) vx += 1;
    if (this.cursors.up.isDown || this.wasd.up.isDown) vy -= 1;
    if (this.cursors.down.isDown || this.wasd.down.isDown) vy += 1;
    if (vx !== 0 && vy !== 0) {
      const inv = Math.SQRT1_2;
      vx *= inv;
      vy *= inv;
    }
    if (vx === 0 && vy === 0) {
      if (this.player.anims.isPlaying) {
        this.player.anims.stop();
        this.player.setTexture("player-f0");
      }
      return;
    }
    if (!this.player.anims.isPlaying) this.player.play("walk-player");

    const step = (WALK_SPEED * Math.min(delta, 250)) / 1000;
    this.player.x = Phaser.Math.Clamp(this.player.x + vx * step, ROOM.x0 + PLAYER_W / 2, ROOM.x1 - PLAYER_W / 2);
    this.player.y = Phaser.Math.Clamp(this.player.y + vy * step, ROOM.wallBottom + PLAYER_H, VIEW_H - 8);
    this.player.setDepth(this.player.y);
    if (vx !== 0) this.player.setFlipX(vx < 0);
  }

  /* ---------------- 贴图生成 ---------------- */

  private buildFloorTexture(): void {
    if (this.textures.exists("floor")) return;
    const g = this.add.graphics();
    g.fillStyle(toPhaserColor(PALETTE.paperDark), 1);
    g.fillRect(0, 0, TILE * 2, TILE * 2);
    g.fillStyle(toPhaserColor(PALETTE.shadow), 0.35);
    g.fillRect(0, 0, TILE, TILE);
    g.fillRect(TILE, TILE, TILE, TILE);
    g.generateTexture("floor", TILE * 2, TILE * 2);
    g.destroy();
  }

  /** 生成一套 4 帧走路贴图（14×20），并注册 walk-<base> 循环动画 */
  private buildPersonFrames(base: string, body: number, hair: number): void {
    const ink = toPhaserColor(PALETTE.ink);
    const skin = toPhaserColor(PALETTE.porkOffal);
    const keys: string[] = [];
    for (let f = 0; f < PERSON_FRAMES; f++) {
      const key = `${base}-f${f}`;
      keys.push(key);
      if (this.textures.exists(key)) continue;
      const swing = WALK_SWING[f] ?? 0;
      const bob = f % 2;
      const g = this.add.graphics();

      g.fillStyle(ink, 1);
      g.fillRect(3, bob, 8, 9);
      g.fillRect(2, 8 + bob, 10, 8);
      g.fillRect(4 + swing, 15 + bob, 2, 3);
      g.fillRect(8 - swing, 15 + bob, 2, 3);

      g.fillStyle(skin, 1);
      g.fillRect(4, 2 + bob, 6, 6);
      g.fillStyle(hair, 1);
      g.fillRect(4, 1 + bob, 6, 2);
      g.fillStyle(body, 1);
      g.fillRect(3, 9 + bob, 8, 6);
      g.fillStyle(ink, 1);
      g.fillRect(4 + swing, 16 + bob, 2, 2);
      g.fillRect(8 - swing, 16 + bob, 2, 2);

      g.generateTexture(key, 14, PERSON_TEX_H);
      g.destroy();
    }
    this.ensureAnim(`walk-${base}`, keys, WALK_FPS, -1);
  }

  private buildBowlTexture(): void {
    if (this.textures.exists("bowl")) return;
    const ink = toPhaserColor(PALETTE.ink);
    const g = this.add.graphics();
    g.fillStyle(toPhaserColor(PALETTE.riceWhite), 1);
    g.fillRect(0, 2, 12, 3);
    g.fillStyle(toPhaserColor(PALETTE.chili), 1);
    g.fillRect(1, 0, 10, 2);
    g.fillStyle(toPhaserColor(PALETTE.bamboo), 1);
    g.fillRect(3, 0, 2, 2);
    g.fillRect(7, 0, 2, 2);
    g.fillStyle(toPhaserColor(PALETTE.wood), 1);
    g.fillRect(1, 5, 10, 3);
    g.fillStyle(ink, 1);
    g.fillRect(1, 8, 10, 1);
    g.generateTexture("bowl", 12, 10);
    g.destroy();
  }

  private buildPlayerFrames(): void {
    const ink = toPhaserColor(PALETTE.ink);
    const white = toPhaserColor(PALETTE.riceWhite);
    const skin = toPhaserColor(PALETTE.porkOffal);
    const apron = toPhaserColor(PALETTE.brick);
    const keys: string[] = [];
    for (let f = 0; f < PERSON_FRAMES; f++) {
      const key = `player-f${f}`;
      keys.push(key);
      if (this.textures.exists(key)) continue;
      const swing = WALK_SWING[f] ?? 0;
      const bob = f % 2;
      const g = this.add.graphics();

      g.fillStyle(ink, 1);
      g.fillRect(4, bob, 8, 8);
      g.fillRect(3, 7 + bob, 10, 9);
      g.fillRect(5 + swing, 16 + bob, 2, 4);
      g.fillRect(9 - swing, 16 + bob, 2, 4);

      g.fillStyle(white, 1);
      g.fillRect(5, 1 + bob, 6, 3);
      g.fillStyle(skin, 1);
      g.fillRect(5, 3 + bob, 6, 5);
      g.fillStyle(apron, 1);
      g.fillRect(4, 8 + bob, 8, 5);
      g.fillStyle(ink, 1);
      g.fillRect(5 + swing, 17 + bob, 2, 3);
      g.fillRect(9 - swing, 17 + bob, 2, 3);

      g.generateTexture(key, PLAYER_W, 26);
      g.destroy();
    }
    this.ensureAnim("walk-player", keys, WALK_FPS, -1);
  }

  private buildStaffFrames(): void {
    const ink = toPhaserColor(PALETTE.ink);
    const white = toPhaserColor(PALETTE.riceWhite);
    const skin = toPhaserColor(PALETTE.porkOffal);
    const uniform = toPhaserColor(PALETTE.sky);
    const keys: string[] = [];
    for (let f = 0; f < PERSON_FRAMES; f++) {
      const key = `staff-f${f}`;
      keys.push(key);
      if (this.textures.exists(key)) continue;
      const swing = WALK_SWING[f] ?? 0;
      const bob = f % 2;
      const g = this.add.graphics();

      g.fillStyle(ink, 1);
      g.fillRect(3, bob, 8, 9);
      g.fillRect(2, 8 + bob, 10, 8);
      g.fillRect(4 + swing, 15 + bob, 2, 3);
      g.fillRect(8 - swing, 15 + bob, 2, 3);

      g.fillStyle(white, 1);
      g.fillRect(4, 1 + bob, 6, 3);
      g.fillStyle(skin, 1);
      g.fillRect(4, 3 + bob, 6, 4);
      g.fillStyle(uniform, 1);
      g.fillRect(3, 9 + bob, 8, 6);
      g.fillStyle(white, 1);
      g.fillRect(5, 10 + bob, 4, 5);
      g.fillStyle(ink, 1);
      g.fillRect(4 + swing, 16 + bob, 2, 2);
      g.fillRect(8 - swing, 16 + bob, 2, 2);

      g.generateTexture(key, 14, PERSON_TEX_H);
      g.destroy();
    }
    this.ensureAnim("walk-staff", keys, WALK_FPS, -1);
  }

  /** 动画只注册一次：场景重启时 anims 里已有同名键 */
  private ensureAnim(key: string, textureKeys: string[], frameRate: number, repeat: number): void {
    if (this.anims.exists(key)) return;
    this.anims.create({
      key,
      frames: textureKeys.map((tex) => ({ key: tex })),
      frameRate,
      repeat,
    });
  }
}

export function createGameConfig(
  onMinute: () => void,
  getSpeed?: () => number,
  getState?: () => GameState | null,
): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    parent: "game",
    width: VIEW_W,
    height: VIEW_H,
    pixelArt: true,
    roundPixels: true,
    backgroundColor: PALETTE.paper,
    scale: {
      mode: Phaser.Scale.NONE,
      width: VIEW_W,
      height: VIEW_H,
      zoom: 2,
      autoCenter: Phaser.Scale.NO_CENTER,
    },
    scene: [],
    callbacks: {
      postBoot: (game) => {
        game.scene.add("world", WorldScene, true, { onMinute, getSpeed, getState });
      },
    },
  };
}
