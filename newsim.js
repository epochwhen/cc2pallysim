class Damage {
    school
    value
    outcome
    constructor(school, value, outcome) {
        this.school = school
        this.value = value
        this.outcome = outcome
    }
}

const Outcome = {
    CRIT: 'CRIT',
    GLANCING: 'GLANCING',
    DODGE: 'DODGE',
    MISS: 'MISS',
    RESIST: 'RESIST',
    HIT: 'HIT',
    PARTIAL_RESIST: 'PARTIAL_RESIST',
}

const School = {
    PHYSICAL: "PHYSICAL",
    HOLY: "HOLY",
    FIRE: "FIRE",
    NATURE: "NATURE",
    FROST: "FROST",
    SHADOW: "SHADOW",
    ARCANE: "ARCANE",
}

class Ability {
    name
    cooldown
    currentCooldown
    gcdBound
    triggersGcd
    school

    context

    constructor(context) {
        this.context = context
    }

    tick(amount) {
        this.currentCooldown -= amount
        if (this.currentCooldown < 0) {
            this.currentCooldown = 0
        }
    }

    prepare(...args) { }
    perform(...args) { }
    canCast() { return true }

}

class Aura extends Ability {
    active = false
    currentDuration
    duration

    activate() {
        this.active = true
        this.currentDuration = this.duration
        Utils.logWithTimestamp("You gain " + this.name, this.context)
    }

    deactivate() {
        this.active = false
        Utils.logWithTimestamp(this.name + " fades from you", this.context)
    }

    tick(amount) {
        this.currentDuration -= amount
        if (this.currentDuration < 0 && this.active) {
            this.deactivate()
        }
    }

    apply = (damage) => { return damage }
    // default implementation, can be overridden in subclasses
}

class Periodic extends Aura {
    tick = (amount) => {
        if (this.duration - this.currentDuration > 0 && (this.duration - this.currentDuration) % this.getPeriod() === 0) {
            const damage = this.getDamage()
            Utils.log(this.name, new Damage(damage.school, damage.value, damage.outcome), this.context)
        }
        super.tick(amount)

    }

    getDamage = () => { }
    getPeriod = () => { }
}


class TheUntamedBladeBuff extends Aura {
    name = "Untamed Fury"
    duration = 8000
    currentDuration = 0

    activate = () => {
        if (!this.active) {
            this.context.STATS.Strength += 300
        }
        super.activate()
    }

    deactivate = () => {
        super.deactivate()
        this.context.STATS.Strength -= 300
    }
}

class SpellBlasting extends Aura {
    name = "Spell Blasting"
    duration = 8000
    currentDuration = 0

    activate = () => {
        if (!this.active) {
            this.context.STATS.SpellPower += 132
        }
        super.activate()
    }

    deactivate = () => {
        super.deactivate()
        this.context.STATS.SpellPower -= 132
    }
}

class SanctityAura extends Aura {
    name = "Sanctity Aura"
    duration = Infinity
    currentDuration = Infinity

    apply = (damage) => {
        if (damage.school === School.HOLY) {
            return new Damage(damage.school, Math.floor(damage.value * 1.1), damage.outcome)
        }
        return damage
    }
}

class TwoHandedSpec extends Aura {
    name = "Two-Handed Spec"
    duration = Infinity
    currentDuration = Infinity

    apply = (damage) => {
        if (damage.school === School.PHYSICAL) {
            return new Damage(damage.school, Math.floor(damage.value * 1.06), damage.outcome)
        }
        return damage
    }
}

class Vengeance extends Aura {
    name = "Vengeance"
    duration = 30000
    stacks = 0
    currentDuration = 0

    apply = (damage) => {
        return new Damage(damage.school, Math.floor(damage.value * (1 + this.stacks * 0.05)), damage.outcome)
    }

    activate = () => {
        this.active = true
        this.currentDuration = this.duration
        this.stacks = Math.min(this.stacks + 1, 3)
        Utils.logWithTimestamp("You gain " + this.name + " (" + this.stacks + ")", this.context)
    }

    deactivate = () => {
        super.deactivate()
        this.stacks = 0
    }
}

class Zeal extends Aura {
    name = "Zeal"
    duration = 30000
    stacks = 0
    currentDuration = 0

    activate = () => {
        this.active = true
        this.currentDuration = this.duration
        this.removeHaste()
        this.stacks = Math.min(this.stacks + 1, 3)
        Utils.logWithTimestamp("You gain " + this.name + " (" + this.stacks + ")", this.context)
        this.applyHaste()
    }

    deactivate = () => {
        super.deactivate()
        this.removeHaste()
        this.stacks = 0
    }

    applyHaste = () => {
        this.context.STATS.MeleeHaste += 5 * this.stacks
    }

    removeHaste = () => {
        this.context.STATS.MeleeHaste -= 5 * this.stacks
    }

    tick(amount) {
        this.currentDuration -= amount
        if (this.currentDuration < 0 && this.active) {
            this.deactivate()
        }
    }
}

class HolyMight extends Aura {
    name = "Holy Might"
    duration = 20000
    currentDuration = 0
    active = false

    activate = () => {
        if (!this.active) {
            this.context.STATS.AttackPower += Math.floor(this.context.STATS.Strength * 0.2) * 2 // these direct coefficients will get fucked up with Untamed Blade, but cba fixing it right now, not my problem if you are an ape ret or progging BWL
        }
        this.active = true
        this.currentDuration = this.duration
        Utils.logWithTimestamp("You gain " + this.name, this.context)
    }

    deactivate = () => {
        if (this.active) {
            this.context.STATS.AttackPower -= Math.floor(this.context.STATS.Strength * 0.2) * 2
        }
        this.active = false
        Utils.logWithTimestamp(this.name + " fades from you", this.context)
    }

    tick(amount) {
        this.currentDuration -= amount
        if (this.currentDuration < 0 && this.active) {
            this.deactivate()
        }
    }
}

class AutoAttack extends Ability {
    constructor(context) {
        super(context)
        this.name = "Auto Attack"
        this.cooldown = this.context.STATS.CurrentSwingSpeed * 1000
        this.currentCooldown = 0
        this.gcdBound = false
        this.triggersGcd = false
        this.school = School.PHYSICAL
    }

    perform = (isExtraAttack) => {
        this.currentCooldown = (this.context.STATS.BaseSwingSpeed / (1 + (this.context.STATS.MeleeHaste + this.context.STATS.BaseMeleeHaste) / 100)) * 1000
        const weaponRoll = Utils.randomIntFromInterval(this.context.STATS.BaseWeaponDamageMin, this.context.STATS.BaseWeaponDamageMax)
        const apModifiedDamage = new Damage(School.PHYSICAL, weaponRoll + ((this.context.STATS.AttackPower / 14) * this.context.STATS.BaseSwingSpeed), null)
        const afterBuffs = Utils.applyEffects(this.context.BUFFS, apModifiedDamage)
        const afterDebuffs = Utils.applyEffects(this.context.DEBUFFS, afterBuffs)
        const damage = Utils.rollAttackTable(afterDebuffs, 2.0, true, this.context)

        Utils.log(this.name, damage, this.context)

        if (Utils.isDamageConnecting(damage)) {
            Utils.performVengeance(damage, this.context)
            Utils.performProcs(isExtraAttack, this.name, this.context)
        }
    }
}

class HolyStrike extends Ability {
    constructor(context) {
        super(context)
        this.name = "Holy Strike"
        this.cooldown = 5.5 * 1000
        this.currentCooldown = 0
        this.gcdBound = true
        this.triggersGcd = true
        this.school = School.HOLY
    }

    perform = () => {
        const base = 309 + this.context.STATS.SpellPower * 0.43 
        const afterBuffs = Utils.applyEffects(this.context.BUFFS, new Damage(School.HOLY, base, null))
        const afterDebuffs = Utils.applyEffects(this.context.DEBUFFS, afterBuffs)
        const damage = Utils.rollAttackTable(afterDebuffs, 2.0, false, this.context)
        this.currentCooldown = this.cooldown
        this.context.ROTATION.filter(ability => ability.name === "Crusader Strike")[0].currentCooldown = this.cooldown // uncomment for experimental zeal
        Utils.log(this.name, damage, this.context)

        this.context.BUFFS.filter(buff => buff.name === "Holy Might")[0].activate()

        if (Utils.isDamageConnecting(damage)) {
            Utils.performVengeance(damage, this.context)
            Utils.performProcs(false, this.name, this.context)
        }
    }

    canCast = () => {
        const zeal = this.context.BUFFS.find(buff => buff.name === "Zeal")
        const holyMight = this.context.BUFFS.find(buff => buff.name === "Holy Might")
        if (zeal.stacks < 3 || holyMight.currentDuration > 5500) return false
        return true
    }
}

class CrusaderStrike extends Ability {
    constructor(context) {
        super(context)
        this.name = "Crusader Strike"
        this.cooldown = 5.5 * 1000
        this.currentCooldown = 0
        this.gcdBound = true
        this.triggersGcd = true
        this.school = School.PHYSICAL
    }

    perform = () => {
        const base = this.weaponRoll() * 0.99 + 177 + this.context.STATS.SpellPower * 0.3 // not fact checked
        const afterBuffs = Utils.applyEffects(this.context.BUFFS, new Damage(School.PHYSICAL, base, null))
        const afterDebuffs = Utils.applyEffects(this.context.DEBUFFS, afterBuffs)
        const damage = Utils.rollAttackTable(afterDebuffs, 2.0, false, this.context)
        this.currentCooldown = this.cooldown
        const holyStrike = this.context.ROTATION.filter(ability => ability.name === "Holy Strike")[0]
        if (holyStrike) {
            holyStrike.currentCooldown = this.cooldown 
        }
        Utils.log(this.name, damage, this.context)
        
        this.context.BUFFS.filter(buff => buff.name === "Zeal")[0].activate()
        
        if (Utils.isDamageConnecting(damage)) {
            Utils.performVengeance(damage, this.context)
            Utils.performProcs(false, this.name, this.context)
        }
    }

    weaponRoll = () => {
        const weaponRoll = Utils.randomIntFromInterval(this.context.STATS.BaseWeaponDamageMin, this.context.STATS.BaseWeaponDamageMax)
        const apModifiedDamage = weaponRoll + ((this.context.STATS.AttackPower / 14) * this.context.STATS.BaseSwingSpeed)
        return apModifiedDamage
    }

    canCast = () => {
        const holyStrike = this.context.ROTATION.find(a => a.name === "Holy Strike")
        // Only cast if Holy Strike cannot be cast
        return !holyStrike || !holyStrike.canCast()
    }
}

class Judgement extends Ability {
    constructor(context) {
        super(context)
        this.name = "Judgement" // of Righteousness
        this.cooldown = 8 * 1000
        this.currentCooldown = 0
        this.gcdBound = false
        this.triggersGcd = true
        this.school = School.HOLY
    }

    perform = () => {
        const base = (187 + this.context.STATS.SpellPower * 0.5) * 1.15 //178 - 196 => 187
        const afterBuffs = Utils.applyEffects(this.context.BUFFS, new Damage(School.HOLY, base, null))
        const afterDebuffs = Utils.applyEffects(this.context.DEBUFFS, afterBuffs)
        const damage = Utils.rollAttackTable(afterDebuffs, 2.0, false, this.context, true)
        this.currentCooldown = this.cooldown
        Utils.log(this.name, damage, this.context)

        if (Utils.isDamageConnecting(damage)) {
            Utils.performVengeance(damage, this.context)
            Utils.performProcs(false, this.name, this.context)
        }

    }
}

class Exorcism extends Ability {
    constructor(context) {
        super(context)
        this.name = "Exorcism"
        this.cooldown = 15 * 1000
        this.currentCooldown = 0
        this.gcdBound = true
        this.triggersGcd = true
        this.school = School.HOLY
    }

    perform = () => {
         const damage = Utils.rollSpellTable(Utils.applyEffects(this.context.DEBUFFS, {
            school: School.HOLY,
            outcome: null,
            value: Utils.applyEffects(this.context.BUFFS, {
                school: School.HOLY,
                outcome: null,
                value: 535 + this.context.STATS.SpellPower * 0.43
            }).value
        }), 1.5, false, this.context)

        this.currentCooldown = this.cooldown
        Utils.log(this.name, damage, this.context)

        if (Utils.isDamageConnecting(damage)) {
            Utils.performVengeance(damage, this.context)
            Utils.performProcs(false, this.name, this.context)
        }

    }
}

class StratholmeHolyWater extends Ability {
    constructor(context) {
        super(context)
        this.name = "Stratholme Holy Water"
        this.cooldown = 120 * 1000
        this.currentCooldown = 0
        this.gcdBound = false
        this.triggersGcd = false
        this.school = School.HOLY
    }
    perform = () => {
        const damage = Utils.rollSpellTable(Utils.applyEffects(this.context.DEBUFFS, {
            school: School.HOLY,
            outcome: null,
            value: Utils.applyEffects(this.context.BUFFS, {
                school: School.HOLY,
                outcome: null,
                value: 501 + this.context.STATS.SpellPower 
            }).value
        }), 1, true, this.context)
        this.currentCooldown = this.cooldown
        Utils.log(this.name, damage, this.context)
        if (Utils.isDamageConnecting(damage)) {
            Utils.performProcs(false, this.name, this.context)
        }
    }
}

class Consecration extends Ability {
    constructor(context) {
        super(context)
        this.name = "Consecration"
        this.cooldown = 8 * 1000
        this.currentCooldown = 0
        this.gcdBound = true
        this.triggersGcd = true
        this.school = School.HOLY
    }

    perform = () => {
        this.currentCooldown = this.cooldown
        Utils.logWithTimestamp("You cast " + this.name, this.context)
        this.context.DEBUFFS.push(new ConsecrationDamage(this.context))
        Utils.performProcs(false, this.name, this.context)
    }
}

class ConsecrationDamage extends Periodic {
    constructor(context) {
        super(context)
        this.name = "Consecration"
        this.duration = 8000
        this.currentDuration = 8000
        this.active = true
        this.school = School.HOLY
    }

    getDamage = () => {
        const base = (512 + this.context.STATS.SpellPower * 0.64) / 8
        // const multipleTargets = base * 1 // adjust for multiple targets
        return Utils.applyEffects(this.context.DEBUFFS, {
            school: this.school, outcome: Outcome.HIT, value: Utils.applyEffects(this.context.BUFFS, {
                school: this.school,
                outcome: Outcome.HIT,
                value: base
            }).value
        })
    }

    getPeriod = () => {
        return 1000;
    }
}

class Utils {
    static applyEffects = (source, damage) => {
        for (let i = 0; i < source.length; i++) {
            if (source[i].currentDuration > 0) damage = source[i].apply(damage)

        }
        return damage
    }

    static randomIntFromInterval = (min, max) => {
        return Math.floor(Math.random() * (max - min + 1) + min)
    }

    static formatstamp = (tick) => {
        const d = new Date(Date.UTC(0, 0, 0, 0, 0, 0, tick)), parts = [d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds()];
        return String(parts[0]).padStart(2, '0') + ":" + String(parts[1]).padStart(2, '0') + "." + String(parts[2]).padStart(3, '0')
    }

    static rollAttackTable = (damage, multiplier, white, context, suppressMechanics) => {
        const glancingChance = white ? 10 + context.TARGET_LEVEL_DIFF * 10 : 0
        // const missChance = 5 + (context.TARGET_LEVEL_DIFF * 5 - 5) * 0.1 - context.STATS.MeleeHitChance // old skill formula
        const missChance = 8 - context.STATS.MeleeHitChance - Math.floor(Math.min(Math.abs(300 - context.STATS.WeaponSkill), 15) / 5)// this will only work for bosses. good enough for now. get capped n00b.
        const dodgeChance = 5 + (context.TARGET_LEVEL_DIFF * 0.04 * 5)
        const critChance = context.STATS.MeleeCritChance - context.TARGET_LEVEL_DIFF * 0.04 * 5 // confirm if this is correct

        // const glancingPenalty = Math.max(0.65 + Math.min(Math.abs(300 - context.STATS.WeaponSkill), 15) * 0.02, 0.95) // old skill formula
        const glancingPenalty = 0.65 + Math.min(Math.abs(300 - context.STATS.WeaponSkill), 15) * 0.02 

        let result = {
            value: 0,
            outcome: null,
            school: damage.school,
        }

        const attackRoll = Utils.randomIntFromInterval(0, 100)
        if (attackRoll < missChance) {
            result.outcome = Outcome.MISS
        } else if (attackRoll < (dodgeChance + missChance) && !suppressMechanics) {
            result.outcome = Outcome.DODGE
        } else if (attackRoll < (glancingChance + dodgeChance + missChance)  && !suppressMechanics ) {
            result.outcome = Outcome.GLANCING
            result.value = Math.floor(damage.value * glancingPenalty)
        } else if (attackRoll < (critChance + glancingChance + dodgeChance + missChance) && multiplier !== 1) {
            result.outcome = Outcome.CRIT
            result.value = Math.floor(damage.value * multiplier)
        } else {
            result.outcome = Outcome.HIT
            result.value = damage.value
        }
        return result
    }

    static rollSpellTable = (damage, multiplier, hitSuppression, context) => {
        //add partial resist
        const attackRoll = Utils.randomIntFromInterval(0, 100)
        const critChance = multiplier === 1 ? 0 : context.STATS.SpellCritChance - context.TARGET_LEVEL_DIFF * 0.04 * 5 //confirm if this is correct
        const missChance = hitSuppression ? 0 : Math.max(1, (context.TARGET_LEVEL_DIFF === 1 ? 4 : context.TARGET_LEVEL_DIFF === 2 ? 5 : context.TARGET_LEVEL_DIFF === 3 ? 16 : 0) - context.STATS.SpellHitChance)

        let result = {
            value: 0,
            outcome: null,
            school: damage.school,
        }

        if (attackRoll < missChance) {
            result.outcome = Outcome.RESIST
        } else if (attackRoll < (critChance + missChance)) {
            result.outcome = Outcome.CRIT
            result.value = Math.floor(damage.value * multiplier)
        } else {
            result.outcome = Outcome.HIT
            result.value = damage.value
        }
        return result
    }

    static performProcs = (isExtraAttack, name, context) => {
        context.PROCS.forEach((proc) => {
            if (proc.proccedBy.includes(name)) {
                const roll = Utils.randomIntFromInterval(0, 100)
                if (roll < proc.chance()) {
                    proc.perform(isExtraAttack)
                }
            }
        })
    }

    static performVengeance = (damage, context) => {
        if (damage.outcome === Outcome.CRIT) {
            context.BUFFS.filter(buff => buff.name === "Vengeance")[0].activate()
        }
    }

    static isDamageConnecting = damage => {
        return (damage.outcome === Outcome.CRIT || damage.outcome === Outcome.HIT || damage.outcome === Outcome.GLANCING || damage.outcome === Outcome.PARTIAL_RESIST)
    }

    static logWithTimestamp = (text, context) => {
        context.combatLog.push(Utils.formatstamp(context.CURRENT_TICK) + " " + text)
    }

    static log = (name, damage, context) => {
        const attackFlavorText = {
            [Outcome.HIT]: " hits for ",
            [Outcome.CRIT]: " crits for ",
            [Outcome.GLANCING]: " hits for ",
            [Outcome.MISS]: " misses.",
            [Outcome.DODGE]: " was dodged by your target.",
            [Outcome.RESIST]: " was resisted.",
        }
        let damageLogText = ""
        if (this.isDamageConnecting(damage)) {
            damageLogText += damage.value
            if (damage.outcome === Outcome.GLANCING) {
                damageLogText += " (glancing)"
            }
            damageLogText += " " + damage.school + " damage"
        }
        context.damageNumbers.push(damage)
        this.logWithTimestamp("Your " + name + attackFlavorText[damage.outcome] + damageLogText, context)

        // Track ability usage, total damage, and outcomes
        if (!context.ABILITY_STATS[name]) {
            context.ABILITY_STATS[name] = {
                count: 0,
                totalDamage: 0,
                outcomes: { CRIT: 0, GLANCING: 0, HIT: 0, MISS: 0, DODGE: 0, RESIST: 0, PARTIAL_RESIST: 0 }
            }
        }
        context.ABILITY_STATS[name].count += 1
        if (this.isDamageConnecting(damage)) {
            context.ABILITY_STATS[name].totalDamage += damage.value
        }
        if (damage.outcome && context.ABILITY_STATS[name].outcomes.hasOwnProperty(damage.outcome)) {
            context.ABILITY_STATS[name].outcomes[damage.outcome] += 1
        }
    }
}

class Proc {
    constructor(context) {
        this.context = context
        this.internalCooldown = 0
    }
    get proccedBy() { return [] }
    chance() { return 0 }
    perform(isExtraAttack) { }
}

class AshbringerProc extends Proc {
    get name() { return "Ashbringer" }
    get proccedBy() { return ["Auto Attack", "Holy Strike", "Crusader Strike", "Seal of Righteousness", "Judgement"] }
    chance() { return 5 * this.context.GLOBAL_PROC_MULT }
    perform() {
        const damage = Utils.rollSpellTable(Utils.applyEffects(this.context.DEBUFFS, {
            school: School.SHADOW,
            outcome: null,
            value: Utils.applyEffects(this.context.BUFFS, {
                school: School.SHADOW,
                outcome: null,
                value: 200 + this.context.STATS.SpellPower // 185-215 averaged to 200
            }).value
        }), 1.5, true, this.context)
        Utils.log("Lifesteal", damage, this.context)
        Utils.performVengeance(damage, this.context)
        Utils.performProcs(false, "Ashbringer", this.context)
    }
}

class WrathOfCenariusProc extends Proc {
    get name() { return "Wrath of Cenarius" }
    get proccedBy() { return ["Holy Strike", "Crusader Strike", "Judgement", "Ashbringer", "Plus Dam Effect", "Consecration"] }
    chance() { return 5 * this.context.GLOBAL_PROC_MULT } // is it 5% really?
    perform() {
        this.context.BUFFS.filter(buff => buff.name === "Spell Blasting")[0].activate()
    }
}

class WindfuryProc extends Proc {
    get name() { return "Windfury" }
    get proccedBy() { return ["Auto Attack", "Holy Strike", "Crusader Strike", "Seal of Righteousness", "Judgement"] }
    chance() { return 15 * this.context.GLOBAL_PROC_MULT }
    perform() {
        if (this.internalCooldown > 0) return; // I guess it is 1.5s for the aura in cc2. not super fact checked
        this.internalCooldown = 1500;
        Utils.logWithTimestamp("You gained an extra attack through Windfury", this.context)
        this.context.ROTATION.filter(ability => ability.name === "Auto Attack")[0].perform(true)
    }
}

class HandOfJusticeProc extends Proc {
    get name() { return "Hand of Justice" }
    get proccedBy() { return ["Auto Attack", "Holy Strike", "Crusader Strike", "Seal of Righteousness", "Judgement"] }
    chance() { return 2 * this.context.GLOBAL_PROC_MULT }
    perform() {
        Utils.logWithTimestamp("You gained an extra attack through Hand of Justice", this.context)
        this.context.ROTATION.filter(ability => ability.name === "Auto Attack")[0].perform(true)
    }
}

class SealOfRighteousnessProc extends Proc {
    get name() { return "Seal of Righteousness" }
    get proccedBy() { return ["Auto Attack"] }
    chance() { return 100 * this.context.GLOBAL_PROC_MULT }
    perform(isExtraAttack) {
        const proc = this.context.ROTATION.filter(ability => ability.name === "Seal of Righteousness")[0]
        const damage = Utils.rollSpellTable(Utils.applyEffects(this.context.DEBUFFS, {
            school: School.HOLY,
            outcome: null,
            value: Utils.applyEffects(this.context.BUFFS, {
                school: School.HOLY,
                outcome: null,
                value: (this.context.STATS.BaseSwingSpeed * 0.098 * this.context.STATS.SpellPower + 20 + (this.context.STATS.BaseSwingSpeed / 4.00) * 51) * 1.15
            }).value
        }), 1, true, this.context)
        Utils.log("Seal of Righteousness", damage, this.context)
        Utils.performProcs(isExtraAttack, "Seal of Righteousness", this.context)
    }
}

class DragonbreathChiliProc extends Proc {
    get name() { return "Dragonbreath Chili" }
    get proccedBy() { return ["Auto Attack", "Holy Strike", "Crusader Strike"] }
    chance() { return 5 * this.context.GLOBAL_PROC_MULT } //needs citation
    perform() {
        const damage = Utils.rollSpellTable(Utils.applyEffects(this.context.DEBUFFS, {
            school: School.FIRE,
            outcome: null,
            value: Utils.applyEffects(this.context.BUFFS, {
                school: School.FIRE,
                outcome: null,
                value: 61 // + this.context.STATS.SpellPower
            }).value
        }), 1.5, false, this.context)
        Utils.log("Dragonbreath Chili", damage, this.context)
        Utils.performVengeance(damage, this.context)
        Utils.performProcs(false, "Dragonbreath Chili", this.context)
    }
}

class PlusDamEffect extends Proc {
    get name() { return "Plus Dam Effect" }
    get proccedBy() { return ["Auto Attack", "Crusader Strike", "Seal of Righteousness", "Holy Strike", "Judgement"] }
    chance() { return 100 * this.context.GLOBAL_PROC_MULT }
    perform() {
        const damage = Utils.rollSpellTable(Utils.applyEffects(this.context.DEBUFFS, {
            school: School.HOLY,
            outcome: null,
            value: Utils.applyEffects(this.context.BUFFS, {
                school: School.HOLY,
                outcome: null,
                value: 2
            }).value
        }), 1.5, true, this.context)
        Utils.log("Meme Item Effect", damage, this.context)
        Utils.performVengeance(damage, this.context)
        Utils.performProcs(false, "Plus Dam Effect", this.context)
    }
}

class Debuff extends Aura {
}

// Nightfall Debuff - for memez
class NightfallDebuff extends Debuff {
    name = "Nightfall"
    duration = Infinity
    currentDuration = Infinity
    active = false

    apply = (damage) => {
        if (damage.school !== School.PHYSICAL) {
            damage = new Damage(damage.school, Math.floor(damage.value * 1.15), damage.outcome)
        }
        return damage
    }
}

// hard coded to 63 dummy = 4211. change as you wish
class ArmorDebuff extends Debuff {
    name = "Armor"
    duration = Infinity
    currentDuration = Infinity
    active = true

    apply = (damage) => {
        if (damage.school === School.PHYSICAL) {
            const armor = 4211
            const dr = armor / (armor + 400 + 85 * 64.5)
            damage = new Damage(damage.school, Math.floor(damage.value * (1.0 - dr)), damage.outcome)
        }
        return damage
    }
}

const STATS = {
    Strength: 299,
    AttackPower: 758,
    SpellPower: 479,
    MeleeCritChance: 23.14,
    SpellCritChance: 7.88,
    BaseMeleeHaste: 2,
    MeleeHaste: 0,
    BaseWeaponDamageMin: 259, //ashbringer
    BaseWeaponDamageMax: 389,
    WeaponSkill: 311,
    BaseSwingSpeed: 3.6,
    CurrentSwingSpeed: 3.53,
    MeleeHitChance: 6,
    SpellHitChance: 6
}

const sim = async () => {
    const SIM_DURATION = 2 * 60 * 1000 // 2 minutes
    const SIM_TICK = 100

    const context = {
        STATS: JSON.parse(JSON.stringify(STATS)),
        BUFFS: null,
        DEBUFFS: null,
        ROTATION: [],
        PROCS: [],
        combatLog: [],
        damageNumbers: [],
        CURRENT_TICK: 0,
        GCD: 0,
        NUMBER_OF_TARGETS: 1,
        TARGET_LEVEL_DIFF: 3,
        SEAL: "Seal of Righteousness",
        TARGET_TYPE: "Undead",
        GLOBAL_PROC_MULT: 1,
        ABILITY_STATS: {} // { [abilityName]: { count: 0, totalDamage: 0 } }
    }

    context.BUFFS = [
        // new TheUntamedBladeBuff(context),
        new SpellBlasting(context),
        new SanctityAura(context),
        new TwoHandedSpec(context),
        new Vengeance(context),
        new Zeal(context),
        new HolyMight(context),
    ]
    context.ROTATION = [
        new AutoAttack(context),
        new HolyStrike(context),
        new CrusaderStrike(context),
        new Judgement(context),
        new Consecration(context),
    ]

    if (context.TARGET_TYPE === "Undead" || context.TARGET_TYPE === "Demon") {
        context.ROTATION.push(new Exorcism(context))
    }
    if (context.TARGET_TYPE === "Undead") {
        context.ROTATION.push(new StratholmeHolyWater(context))
    }

    context.PROCS = [
        new AshbringerProc(context),
        new WrathOfCenariusProc(context),
        new WindfuryProc(context),
        // new HandOfJusticeProc(context),
        new SealOfRighteousnessProc(context),
        new DragonbreathChiliProc(context),
        new PlusDamEffect(context),
    ]

    context.DEBUFFS = [
        new NightfallDebuff(context),
        new ArmorDebuff(context),
    ]

    while (SIM_DURATION > context.CURRENT_TICK) {
        context.ROTATION.forEach(ability => {
            let canCast = (context.GCD <= 0 || !ability.gcdBound) && ability.canCast()
            let isOnCooldown = ability.currentCooldown > 0

            if (canCast && !isOnCooldown) {
                ability.perform()
                if (ability.triggersGcd) {
                    context.GCD = 1.5 * 1000
                }
            }
            ability.tick(SIM_TICK)
        })

        context.PROCS.forEach(proc => {
            if (proc.internalCooldown > 0) {
                proc.internalCooldown -= SIM_TICK
            }
        })

        context.BUFFS.forEach(buff => { buff.tick(SIM_TICK) })

       context.DEBUFFS.forEach(debuff => {
            if (debuff.tick) {
                debuff.tick(SIM_TICK)
            }
        })

        // Remove expired periodic debuffs
        context.DEBUFFS = context.DEBUFFS.filter(debuff =>
            !(debuff instanceof Periodic && debuff.currentDuration < 0)
        )

        context.GCD -= SIM_TICK
        context.CURRENT_TICK += SIM_TICK
    }

    Utils.logWithTimestamp("Simulation ended", context)

    return {
        dps: context.damageNumbers.map(a => a.value).reduce((a, b) => a + b, 0) / (SIM_DURATION / 1000),
        log: context.combatLog,
        abilityStats: context.ABILITY_STATS
    }
}

const promises = []
for (let i = 0; i < 2001; i++) {
    promises.push(sim())
}

Promise.all(promises).then(results => {
   const dpsArray = results.map(r => r.dps)
    // Mean (arithmetic average)
    const mean = dpsArray.reduce((a, b) => a + b, 0) / dpsArray.length

    // Median
    const sorted = [...dpsArray].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    const median = sorted.length % 2 !== 0
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2


    // Find a simulation with DPS between mean and median
    const lower = Math.min(mean, median)
    const upper = Math.max(mean, median)
    const match = results.find(r => r.dps > lower && r.dps < upper)

    if (match) {
        console.log("Combat log for a simulation between mean and median DPS:")
        match.log.forEach(line => console.log(line))
        console.log("Ability usage and total damage:")
        Object.entries(match.abilityStats).forEach(([name, stats]) => {
            console.log(`${name}: Casts = ${stats.count}, Total Damage = ${stats.totalDamage}`)
            console.log(`  Outcomes: ${Object.entries(stats.outcomes).map(([outcome, count]) => `${outcome}: ${count}`).join(', ')}`)
        })
    } else {
        const randomResult = results[Math.floor(Math.random() * results.length)]
        console.log("No simulation found with DPS between mean and median.")
        console.log("Combat log for a random simulation (DPS: " + randomResult.dps + "):")
        randomResult.log.forEach(line => console.log(line))
        console.log("Ability usage and total damage:")
        Object.entries(randomResult.abilityStats).forEach(([name, stats]) => {
            console.log(`${name}: Casts = ${stats.count}, Total Damage = ${stats.totalDamage}`)
        })
    }
    
    console.log("Mean DPS: " + mean)
    console.log("Median DPS: " + median)
}).catch(err => {
    console.error("Error in simulation: ", err)
})

