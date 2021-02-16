const schedule = require('node-schedule');
const { Markup,Telegraf } = require('telegraf')
const MongoClient = require("mongodb").MongoClient;
const fs = require('fs');
const { log } = require('console');
const { brotliCompress } = require('zlib');
const { ifError, throws } = require('assert');
const arGs = require('./commandArgs');

const _DEBUG = true;

const token = "1063342985:AAHvN1QdZUt90BAsdo-Qc3as7pGz-HaspNA";
const bot = new Telegraf(token)

bot.use(arGs());

/*MONGO*/
const _DB = "Bot";
const _tables = {
  _usersTable:"Users",
  _sectTable:"Sects",
  _wildTable:"Wild",
  _locationTable:"Location",
  _battleTable:"Battle",
  _itemTable:"Items",
  _buildingTable:"Building"
};
const _image = {
  _locationImage:"location"
}
const _setting = { useUnifiedTopology: true,connectTimeoutMS: 30000,keepAlive: 1 };
const _url = 'mongodb://root:password@localhost:27017/';

/*INFO*/
const _helpCommands = 
`{xxx} - {} не писать, пишите значение заместо вставки.
У всех команд есть, сокращения, найдите их.
/cultivate {t} - Культивировать сколько секунд.
/immortals - Покажет топ культиваторов и их уровень.
/location - Где вы находитесь? Переходы между локациями.
/attak - Напасть на противника в локиции.
/me - Информация о вас.
/clCancle - Отменить культивацию! (Очень опасно, вы можете потерять свой прогресс культивации).
/baCancle - Отмена битвы! (/bac)
`
var dir = 'logs'
var now = new Date(Date.now());
var date = `${now.getUTCDate()}.${now.getUTCMonth()}.${now.getUTCFullYear()}`
var access = fs.createWriteStream(dir + `/L_${date}.log`, { flags: 'a' });

schedule.scheduleJob({hour: 00, minute: 00}, function(){ //Меняем лог фал, через день, с новой датой.
  now = new Date(Date.now());
  date = `${now.getUTCDate()}.${now.getUTCMonth()}.${now.getUTCFullYear()}`
  access.close();
  access = fs.createWriteStream(dir + `/L_${date}.log`, { flags: 'a' });
});

var originalLog = console.log;
console.log = function(str,type='msg'){
  var d = new Date();
  originalLog(str);
  if(type === 'msg') access.write(`[log][${d.toLocaleTimeString()}]${str}\n`);
  else if(type === 'err') access.write(`[ERR][${d.toLocaleTimeString()}]${str}\n`);
}

console.log('---------------------START-----------------------');

class User {
  static table = _tables._usersTable;
  static NAMES;
  Character = {
    Info:{_id:0,_name:'',_loc:'d_ShanSci'},
    Stat:{_hp:100,_attak:6,_defend:2,_dodge:1,_realHp:100},
    Cultivation:{_level:0,_points:0},
    TimeOut:{_cultivate:0},
    Interval:{_cultivate_update:0},
    Inventory:[]
  }
  constructor(from) {
    this.Character.Info._id = from?.id;
    this.Character.Info._name = from?.first_name;
  }
  muve(loc,ctx) {
    Location.getLocationByUser(this, (l)=>{
      l.people.splice(l.people.findIndex(th=>th==this.Character.Info._id),1) // delete user from loc
      Location.updateLocation(l)
      if(l != undefined){
       var ld = l.ways.find(item => {
        return item == loc
       })
       if(ld != undefined && ld.length > 0 ){
        this.Character.Info._loc = ld
        Location.getLocationByUser(this,(loc)=>{
          loc.people.push(this.Character.Info._id) //Insert user to new location
          Location.updateLocation(loc,(tr)=>{
            User.updateUser(this,(tr)=>{
              locationShow(ctx)
                console.log(`${this.Character.Info._id} ${this.Character.Info._name} muved to ${ld}`)
            })  
          })
        })
       }else{
        ctx.reply('Немогу найти путь к этому месту...');
       }
      }
    })
  }
  addItemRange(items){
    items.forEach(it => {
      if(Object.keys(this.Character.Inventory).length > 0){
        var found = this.Character.Inventory.find(element => element.n==it.n);
        if(found != undefined) {
          found.count = found.count + it.count;
        }else{ this.Character.Inventory.push({n:it.n,count:it.count}); }
      }else{
        this.Character.Inventory.push({n:it.n,count:it.count});
      }
    });
    User.updateUser(this,(tr)=>{ // Треба тестить abo if(ii >= Object.keys(loc.wild).length) {
      if(_DEBUG === true){console.log(`${this.Character.Info._name} add items: ${items}`)}
    })
  }
  addItem(item,count){
    if(Object.keys(this.Character.Inventory).length > 0){
      var found = this.Character.Inventory.find(element => element.n==item);
      if(found != undefined) {
        found.count = found.count + count;
      }else{ this.Character.Inventory.push({n:item,count:count}); }
    }else{
      this.Character.Inventory.push({n:item,count:count});
    }
    User.updateUser(this,(tr)=>{
      if(_DEBUG === true){console.log(`${this.Character.Info._name} add item: ${item} count: ${count}`)}
    })
  }
  showItems(ctx){
    if(Object.keys(this.Character.Inventory).length > 0){
      for (var item of this.Character.Inventory) {
        Item.getItemByName(item.n,(it)=>{ctx.reply(`${it.name} - ${item.count}`)})
      }
    }else{ctx.reply('Нету 😿😿😿')}
  }
  static insertUser(user,clb = ()=>{}) {
    const mongoClient = new MongoClient(_url, _setting);
    mongoClient.connect(function(err, client){
        const db = client.db(_DB);
        const collection = db.collection(User.table);
        collection.insertOne(user, function(err, result){
            if(err){ 
                return console.log(err,'err');
            }
            clb(user);
            client.close();
        });
    });
  }

  static updateUser(user, clb = (tr)=>{ if(_DEBUG) console.log(`Update: ${tr}`) }){
    const mongoClient = new MongoClient(_url, _setting);
    mongoClient.connect(function(err, client){
      if (err) console.log(err,'err');
      const db = client.db(_DB);
      const collection = db.collection(User.table);
      var newvalues = { $set: {Character:user.Character} }
      collection.updateOne({'Character.Info._id':user.Character.Info._id}, newvalues, function(err, res) {
        if (err) {clb(false); return false;};
        clb(true);
        client.close();
      });
    })
  }

  static getUser(from, clb) {
    const mongoClient = new MongoClient(_url, _setting);
    mongoClient.connect(function(err, client){
      if(err) return console.log(err,'err');
      const db = client.db(_DB);
      db.collection(User.table).findOne({'Character.Info._id':from?.id}, function(err, result) {
        if (err) console.log(err,'err');
        client.close();
        clb(result);
      });
    });
  }

  static getUserById(id,clb){
    const mongoClient = new MongoClient(_url, _setting);
    mongoClient.connect(function(err, client){
      if(err) return console.log(err,'err');
      const db = client.db(_DB);
      db.collection(User.table).findOne({'Character.Info._id':id}, function(err, result) {
        if (err) console.log(err,'err');
        client.close();
        clb(result);
      });
    });
  }

  static getTopUsers(clb){
    const mongoClient = new MongoClient(_url, _setting);
    mongoClient.connect(function(err, client){
      if(err) return console.log(err,'err');
      const db = client.db(_DB);
      db.collection(User.table).find({'Character.Cultivation._points': {$exists: true}}).sort({'Character.Cultivation._points' : -1}).limit(10).toArray(function(err, result) {
        if (err) console.log(err,'err');
        client.close();
        clb(result);
      })
    });
  }

  static createObj(user){
    return Object.assign(new User, user);
  }
}

const _defender_types = {
  _player:"Player",
  _bot:"Bot"
}
class Battle{
  static table = _tables._battleTable;
  Battle = {
    _attaker:'',
    _defender:'',
    _defender_type:'',
    _attaker_hp:0,
    _defender_hp:0,
    _attaker_timer:0,
    _defender_timer:0,
    _timeStamp:0,
    message:{
      _id:0,
      _chatId:0 
    }
  }
  static createBattleWild(user,wild,clb = ()=>{console.log('Battle crated')}){
    const mongoClient = new MongoClient(_url, _setting);
    mongoClient.connect(function(err, client){
        const db = client.db(_DB);
        const collection = db.collection(Battle.table);
        var battle = new Battle();
        battle.Battle._attaker = user.Character.Info._id;
        battle.Battle._attaker_hp = user.Character.Stat._realHp;
        battle.Battle._defender_type = _defender_types._player;
        battle.Battle._defender = wild.n;
        battle.Battle._defender_hp = wild.stat.hp;
        battle.Battle._attaker_timer = 60;
        battle.Battle._defender_timer = 60;
        battle.Battle._timeStamp = Date.now();
        collection.insertOne(battle, function(err, result){
            if(err){ 
                return console.log(err,'err');
            }
            clb(true);
            client.close();
        });
    });
  }
  static checkStartedBattle(user,clb){
    const mongoClient = new MongoClient(_url, _setting);
    mongoClient.connect(function(err, client){
      if(err) return console.log(err,'err');
      const db = client.db(_DB);
      db.collection(Battle.table).findOne({'Battle._attaker':user.Character.Info._id}, function(err, result) {
        if (err) {console.log(err,'err'); clb(false);}
        client.close();
        if(result == null) {clb(false); return false;}
        clb(true);
      });
    });
  }
  static getBattleByUser(user,clb){
    const mongoClient = new MongoClient(_url, _setting);
    mongoClient.connect(function(err, client){
      if(err) return console.log(err,'err');
      const db = client.db(_DB);
      db.collection(Battle.table).findOne({'Battle._attaker':user.Character.Info._id}, function(err, result) {
        if (err) return false;
        client.close();
        clb(result);
      });
    });
  }
  static updateBattle(battle, clb = (tr)=>{ if(_DEBUG) console.log(`Update: ${tr}`) }){
    const mongoClient = new MongoClient(_url, _setting);
    mongoClient.connect(function(err, client){
      if (err) console.log(err,'err');
      const db = client.db(_DB);
      const collection = db.collection(Battle.table);
      var newvalues = { $set: {Battle:battle.Battle} }
      collection.updateOne({'Battle._attaker':battle.Battle._attaker}, newvalues, function(err, res) {
        if (err) {clb(false); return false;};
        clb(true);
        client.close();
      });
    })
  }
  static deleteBattle(battle, clb = (tr)=>{if(_DEBUG) console.log(`Delete ${tr}`)}){
    const mongoClient = new MongoClient(_url, _setting);
    mongoClient.connect(function(err, client){
      if (err) console.log(err,'err');
      const db = client.db(_DB);
      const collection = db.collection(Battle.table);
      var myquery = { 'Battle._attaker':battle.Battle._attaker  };
      collection.deleteOne(myquery, function(err, obj) {
        if (err) console.log(err,'err');
        console.log(`Battle ${battle.Battle._attaker} deleted!`);
        clb(true);
        client.close();
      });
    })
  }

  static battle(user,ctx){
    Battle.getBattleByUser(user, (battle)=>{
      Wild.getWildByName(battle.Battle._defender,(enemy)=>{
        var s = ctx.reply(`Противник ${enemy.name}\nЗдоровья: ${battle.Battle._defender_hp}/${enemy.stat.hp}\nВаше здоровье: ${battle.Battle._attaker_hp}/${user.Character.Stat._hp}`);
        s.then((x)=>{
          battle.Battle.message._id = x.message_id;
          battle.Battle.message._chatId = x.chat.id;
          Battle.updateBattle(battle,()=>{ //Теперь у нас есть линканутое сообщение
            var inlineMessageRatingKeyboard = Markup.inlineKeyboard([
              Markup.button.callback('⚔️', 'battle_attak'),
              Markup.button.callback('🔙', 'battle_retreat')
            ])
            console.log(inlineMessageRatingKeyboard)
            ctx.telegram.sendMessage(
                ctx.from.id,
                'Действия:',
                inlineMessageRatingKeyboard)
          })
        })
      })
    });
  }
}

bot.on('callback_query', (ctx) => {
  // Explicit usage
  ctx.telegram.answerCbQuery(ctx.callbackQuery.id)
  if(_DEBUG === true) {console.log(`${ctx.from.id} ${ctx.from.username} action ${ctx.callbackQuery.data}`)}
  User.getUser(ctx.from,(user)=>{
    if(user != undefined){
      switch(ctx.callbackQuery.data)
      {
        case 'battle_attak':
        case 'battle_retreat':
          Battle.getBattleByUser(user,(battle)=>{
            if(battle != undefined){
              if(ctx.callbackQuery.data == 'battle_attak'){
                Wild.getWildByName(battle.Battle._defender,(enemy)=>{
                  if(enemy != undefined){
                    battle.Battle._defender_hp = battle.Battle._defender_hp - user.Character.Stat._attak; //ДОБАВИТЬ ЗАЩИТУ И УВОРОТ!!!!
                    battle.Battle._attaker_hp = battle.Battle._attaker_hp - enemy.stat.attak;
  
                    if(battle.Battle._defender_hp <= 0){ //ПОБЕДА, нужно добавить выпадения лута
                      user.Character.Stat._realHp = battle.Battle._attaker_hp;
                      user.Character.Cultivation._points = user.Character.Cultivation._points + enemy.cultivate;
                      User.updateUser(user,()=>{
                        var us = Object.assign(new User, user);
                
                        ctx.telegram.editMessageText(battle.Battle.message._chatId,battle.Battle.message._id,battle.Battle.message._id,
                          `Победа!\nВаше здоровье: ${battle.Battle._attaker_hp}/${user.Character.Stat._hp}\nКультивация +${enemy.cultivate}\nКультивация сейчас:${user.Character.Cultivation._points}`);
  
                        ctx.deleteMessage(ctx.callbackQuery.message.message_id);
                        Battle.deleteBattle(battle);
  
                        var items = [];
                        for (var l of enemy.loot) {
                          if(getRandomArbitrary(0,1000) <= l.chance)
                          {
                            if(items.length == 0) ctx.reply('Вы получили:')
                            var co = Math.floor(getRandomArbitrary(l.c_min,l.c_max));
                            items.push({n:l.n,count:co})
                            Item.getItemByName(l.n,(item)=>{ctx.reply(`${item.name} - ${co}`)})
                          }
                        }
                        us.addItemRange(items);
                        return true;
                      })
                    }else if(battle.Battle._attaker_hp <= 0){//Поражение -----------------------------------------------------------------------ДОДЕЛАТЬ!!!!
                      ctx.reply('Этого пока нет)');
                      battleLeave(ctx);
                    }else{
                      Battle.updateBattle(battle,()=>{
                        ctx.telegram.editMessageText(battle.Battle.message._chatId,battle.Battle.message._id,battle.Battle.message._id,
                          `Противник ${enemy.name}\nЗдоровья: ${battle.Battle._defender_hp}/${enemy.stat.hp}\nВаше здоровье: ${battle.Battle._attaker_hp}/${user.Character.Stat._hp}`);
                      });
                    }
                }
                })
              }else if(ctx.callbackQuery.data == "battle_retreat"){
                battleLeave(ctx);
              }
            }
          })
        break;
        case `market_sell_all`:
          
        break;
      }
    }else{ctx.reply('Какой бой, если ты даже не рождён!');}
  })
  // Using context shortcut
  ctx.answerCbQuery()
})

function getRandomArbitrary(min, max) {
  return Math.random() * (max - min) + min;
}

class Item{
  static table = _tables._itemTable;
  static getItemByName(name,clb){
    const mongoClient = new MongoClient(_url, _setting);
    mongoClient.connect(function(err, client){
      if(err) return console.log(err,'err');
      const db = client.db(_DB);
      db.collection(Item.table).findOne({n:name}, function(err, result) {
        if (err) console.log(err,'err');
        client.close();
        clb(result);
      });
    });
  }
}

class Building{
  static table = _tables._buildingTable;
  static query_path = "building";
  static getBuildingByName(name,clb){
    const mongoClient = new MongoClient(_url, _setting);
    mongoClient.connect(function(err, client){
      if(err) return console.log(err,'err');
      const db = client.db(_DB);
      db.collection(Building.table).findOne({n:name}, function(err, result) {
        if (err) console.log(err,'err');
        clb(result);
      });
    });
  }
}

class Location {
  static table = _tables._locationTable;
  static image = _image._locationImage;
  static getLocationByUser(us, clb){
    const mongoClient = new MongoClient(_url, _setting);
    mongoClient.connect(function(err, client){
      if(err) return console.log(err,'err');
      const db = client.db(_DB);
      db.collection(Location.table).findOne({n:us.Character.Info._loc}, function(err, result) {
        if (err) console.log(err,'err');
        client.close();
        clb(result);
      });
    });
  }
  static getLocationByN(name, clb){
    const mongoClient = new MongoClient(_url, _setting);
    mongoClient.connect(function(err, client){
      if(err) return console.log(err,'err');
      const db = client.db(_DB);
      db.collection(Location.table).findOne({n:name}, function(err, result) {
        if (err) console.log(err,'err');
        client.close();
        clb(result);
      });
    });
  }
  static updateLocation(location, clb = (tr)=>{if(_DEBUG===true)console.log(`${location.n} updated ${tr}`)}){
    const mongoClient = new MongoClient(_url, _setting);
    mongoClient.connect(function(err, client){
      if (err) console.log(err,'err');
      const db = client.db(_DB);
      const collection = db.collection(Location.table);
      var newvalues = { $set: location }
      collection.updateOne({'n':location.n}, newvalues, function(err, res) {
        if (err) {clb(false); return false;};
        clb(true);
        client.close();
      });
    })
  }
}

class Wild {
  static table = _tables._wildTable;
  static getWildByName(na, clb){
    const mongoClient = new MongoClient(_url, _setting);
    mongoClient.connect(function(err, client){
      if(err) return console.log(err,'err');
      const db = client.db(_DB);
      db.collection(Wild.table).findOne({n:na}, function(err, result) {
        if (err) console.log(err,'err');
        client.close();
        clb(result);
      });
    });
  }
}

class dbWork {
  static createDBandTABLE(){
    dbWork.creatTable(User.table);
    dbWork.creatTable(_tables._sectTable);
    dbWork.creatTable(Wild.table, 'wild');
    dbWork.creatTable(Location.table, 'location')
    dbWork.creatTable(Battle.table)
    dbWork.creatTable(Item.table, 'item')
    dbWork.creatTable(Building.table, 'buildings')
  }

  static jsonRead(jsonName,tableName){
    /*Load JSON*/
    const ww = JSON.parse(fs.readFileSync(`json/${jsonName}.json`, 'utf8'));
    var ii = Object.keys(ww).map(key => {
      return ww[key];
    })
    const mongoClient = new MongoClient(_url, _setting);
    mongoClient.connect(function(err, client){
      const db = client.db(_DB);
      const collection = db.collection(tableName);
      collection.insertMany(ii, function(err, result){
          if(err){ 
              return console.log(err,'err');
          }
          client.close();
      });
    });
  }

  static creatTable(table, json = undefined, clb = undefined){
    console.log(`Check ${table}`)
    const client = new MongoClient(_url,_setting);
    client.connect(function(err) {
      if (err) { console.log(`Database ${_DB} not EXIST!!! Create IT NOW!!!!`); return false; };
      var db = client.db(_DB);
        db.createCollection(table, function(err, res) {
          if (err?.code != 48) {console.log(err,'err'); clb ? clb(): console.log(`${table} no clb`); }
          if (json != undefined) { dbWork.jsonRead(json,table) }
          console.log(`Collection ${table} created!`);
          client.close();
        });
    });
  }
}

class _Time {
  static convert(seconds){
    var ost = 0;
    var hour = 0;
    var minute = 0;
    if(seconds > 60){
      if(seconds > 60*60){
        ost = seconds % (60*60)
        hour = Math.floor(seconds / (60*60))
        seconds = ost
      }
      ost = seconds % 60
      minute = Math.floor(seconds / 60)
      seconds = ost
    }
    return {hour:hour,minute:minute,second:seconds}
  }
  static getCultTime(time){
    var time = _Time.convert(time);
    var text = 'Осталось';
    if(time.hour == 1) text = `${text} ${time.hour} час,`
    else if(time.hour > 1 && time.hour <= 4) text = `${text} ${time.hour} часа,`
    else if(time.hour > 4 && time.hour <= 12) text = `${text} ${time.hour} часов,`
    if(time.minute > 0) text = `${text} ${time.minute} минут,`
    if(time.second > 0) text = `${text} ${time.second}с`
    return `${text}  культивировать!`
  }
}

bot.command('me', (ctx) => {
  User.getUser(ctx.update.message.from,(user)=>{
    ctx.reply(`Вы: ${user.Character.Info._name}.\nВаш уровень культивации: ${user.Character.Cultivation._points}\nВаши предметы:`);
    var us = Object.assign(new User, user);
    us.showItems(ctx);
  })
})

bot.command(['cultivate','cult','c'], (ctx) => {
  User.getUser(ctx.update.message.from, (user)=>{
    if(user == undefined) {ctx.reply('Культивация невозможна, используйте: /start'); return false;}
    if(user.Character.TimeOut._cultivate != 0) // Если уже культивируем
    { 
      ctx.reply('Я уже культивирую! Хочешь отменить? \n/clCancle');
      return false;
    } 
    //Аргументы
    var time_arg = ctx.state.command.args[0];
    if(time_arg == null || time_arg == undefined || time_arg == 0 || isNaN(time_arg)) {time_arg=30}
    if(time_arg > 3600*6) { ctx.reply('Вы что старец?'); return false } // Треба по рівню збільшувати час напевне
    console.log(`id: ${ctx.update.message.from?.id} name: ${ctx.update.message.from?.first_name} time: ${time_arg}`);
    var time = parseInt(time_arg);
    time = time * 1000;

    //Начинаем
    var s = ctx.reply(`Начинаю культивацию!`);
    s.then((x)=>{
      var m_id = x.message_id;
      var c_id = x.chat.id;
      var _time_pass = 0;
      let _iterv = setInterval((m,c)=>{
        _time_pass++;
        ctx.telegram.editMessageText(c,m,m,_Time.getCultTime(time_arg - _time_pass));
      },1000,m_id,c_id)
      user.Character.Interval._cultivate_update = parseInt(_iterv);
      User.updateUser(user, (result) => {
          //По окончанию
          function endCultivate(arg) {
            User.getUser(ctx.update.message.from,(us)=>{
              arg.reply(`Культивация окончена!`);
              ctx.telegram.deleteMessage(c_id,m_id);
              clearInterval(_iterv);
              us.Character.Cultivation._points = us.Character.Cultivation._points + time/1000;
              us.Character.TimeOut._cultivate = 0; //Чистим таймаут!
              us.Character.Interval._cultivate_update = 0;
              User.updateUser(us, (tr)=>{ if(_DEBUG) console.log(`cultivate update ${us.Character.Info._name}: ${tr}`) });
              console.log(`Name: ${us.Character.Info._name}, score: ${us.Character.Cultivation._points}`)
            })
          }
          //Сначало это. Моментное действие, user не перечитем.
          let timeout = setTimeout(endCultivate, time, ctx);
          user.Character.TimeOut._cultivate = parseInt(timeout);
          User.updateUser(user);
      });
    })
  })
})

bot.command(['baCancle','bac'], (ctx) => {
  battleLeave(ctx);
})

function battleLeave(ctx){
  User.getUser(ctx.from, (user) => {
    if(user != undefined){
      Battle.checkStartedBattle(user,(what)=>{
        if(what){
          Battle.getBattleByUser(user,(battle)=>{
            Battle.deleteBattle(battle,()=>{
              ctx.reply('Вы трусливо сбежали с битвы!');
            })
          })
        }else{ctx.reply('А вы и не дрались)');}
      })
    }
  })
}

bot.command(['clCancle','cl'], (ctx) => {
  User.getUser(ctx.update.message.from, (user) => {
    if(user != undefined){
      if(user.Character.TimeOut._cultivate != 0){
        clearTimeout(user.Character.TimeOut._cultivate);
        clearInterval(user.Character.Interval._cultivate_update);
        user.Character.TimeOut._cultivate = 0;
        user.Character.Interval._cultivate_update = 0;
        User.updateUser(user, (tr)=>{ ctx.reply('Культивация прервана - прогресс утерян...'); console.log(`cultivate cancle ${user.Character.Info._name}: ${tr}`) });
      }else{ctx.reply('Что отменять то? Вы и так не культивируете, лодрь!');}
    }
  })
})

bot.command(['loc','location','loca','l'], (ctx) => {
  locationShow(ctx);
})

function locationShow(ctx) {
  User.getUser(ctx.update.message.from,(user)=>{
    if(user != undefined){
      Location.getLocationByUser(user,(loc)=>{
        var img = ctx.replyWithPhoto({ source: `img/${Location.image}/${loc.n}.png` })
        img.then((x)=>{
          if(Object.keys(loc.wild).length > 0){
            var names = ''
            var ii = 0;
            for (var w of loc.wild) {
              Wild.getWildByName(w, (wild)=>{
                ii++;
                if(wild != undefined) {names = `${names}${wild.name}`}
                if(names.length < 1) {names = 'никто'}
                if(ii >= Object.keys(loc.wild).length) {
                  var rep = ctx.reply(
                    `Вы находетесь в локации: ${loc.name}\nЭто: ${loc.desc}\nЗдесь: ${loc.people.length} 👨‍🎤 /who\nТут водятся: ${names}`
                  );
                  rep.then((x)=>{
                    showBuildings(loc, ctx,()=>{showWay(loc, ctx);});
                  })
                }else{names = `${names}, `}
              })
            }
          }else{
            var rep = ctx.reply(
              `Вы находетесь в локации: ${loc.name}\nЭто: ${loc.desc}\nЗдесь: ${loc.people.length} 👨‍🎤 /who\nТут никто не водется.`
            );
            rep.then((x)=>{
              showBuildings(loc, ctx,()=>{showWay(loc, ctx);});
            })
          }
        })
      })
    }else{ctx.reply('Ваша душа витает на створках мироздания.')}
  })
}

function showBuildings(loc, ctx, clb = ()=>{}){
  if(Object.keys(loc.interest).length > 0){
    var ii = 0;
    var inlineMessageRatingKeyboard = Markup.inlineKeyboard([]);//Markup.button.callback('🔎', `location_search`)
    inlineMessageRatingKeyboard.reply_markup.inline_keyboard = new Array();
    inlineMessageRatingKeyboard.reply_markup.inline_keyboard.push([])
    loc.interest.forEach(build => {
      Building.getBuildingByName(build,(b)=>{
        inlineMessageRatingKeyboard.reply_markup.inline_keyboard[0].push(Markup.button.callback(`${b.emoji}${b.name}`, `${Building.query_path}_${b.n}`));
        ii++;
        if(ii >= Object.keys(loc.wild).length) {
          var ms = ctx.telegram.sendMessage(
              ctx.from.id,
              'Места интереса:',
              inlineMessageRatingKeyboard)
          ms.then(()=>{clb()});
        }
      })
    });
  }else{clb()}
}

function showWay(loc, ctx){
  if(Object.keys(loc.ways).length > 0){
    ctx.reply('Переходы:');
    for (var l of loc.ways) {
      Location.getLocationByN(l,(lo)=>{
        ctx.reply(`/go_${lo.n} - ${lo.name}`);
      })
    }
  }
}

bot.command(['find','attak','enemy','a'], (ctx)=> {
  User.getUser(ctx.update.message.from, (user)=>{
    if(user == undefined) { ctx.reply('Вы не из мира сего, вы не можете напасть на врагов.\n/start'); return false;}
    Battle.checkStartedBattle(user,(result)=>{
      if(!result){
        Location.getLocationByUser(user, (loc)=>{
          if(Object.keys(loc.wild).length > 0){
            var w = loc.wild[Math.floor(Math.random() * loc.wild.length)];
            if(Object.keys(loc.herbs).length > 0){
              if(getRandomArbitrary(0,1000) < loc.herb_chance){
                var us = User.createObj(user);
                var items = [];
                ctx.reply('После поисков, вы нашли:')
                for (var l of loc.herbs) {
                  if(getRandomArbitrary(0,1000) <= l.chance)
                  {
                    var co = Math.floor(getRandomArbitrary(l.c_min,l.c_max));
                    items.push({n:l.n,count:co})
                    Item.getItemByName(l.n,(item)=>{ctx.reply(`${item.name} - ${co}`)})
                  }
                }
                if(items.length == 0) ctx.reply('Ничего(');
                us.addItemRange(items);
                return true;
              }
            }
            Wild.getWildByName(w,(wild)=>{
              Battle.createBattleWild(user,wild,()=>{
                ctx.reply(`Вы напали на: ${wild.name}`);
                Battle.battle(user,ctx);
              })
            })
          }
        })
      }else{
        ctx.reply('Вы уже и так в бою!');
        //Нужно сделать выход с боя с штрафами.
      }
    })
  })
})

bot.command(['immortals','im','imm'], (ctx) => {
  ctx.reply('Топ безсмертных мира сего:');
  User.getTopUsers((users)=>{
    var list = '';
    var i = 1;
    console.log(`Show Immortals for ${ctx.update.message.from?.first_name}`);
    users.forEach(us => {
      list = `${list}${i}: ${us.Character.Info._name}[${us.Character.Cultivation._points}]\n`;
      i++
    });
    if(list.length < 1) { ctx.reply('Этот мир девственно чист ;('); return false; }
    ctx.reply(list);
  });
})

bot.command('t',(ctx)=>{ //------------------------------------------------------------------------TEST
  User.getUser(ctx.from,(us)=>{
    var user = Object.assign(new User, us);
    user.addItem("crystal_low_quality",2);
  })
})

bot.command('who',(ctx)=>{
  User.getUser(ctx.from,(us)=>{
    Location.getLocationByUser(us,(loc)=>{
      var users = []
      var max = Object.keys(loc.people).length;
      var ii = 0;
      var arg1 = ctx.state.command.args[0];
      if(arg1 != undefined && arg1 === 'a') arg1 = true; else arg1 = true;
      for(var p of loc.people)
      {
        ii++;
        User.getUserById(p,(us)=>{
          users = `${users}[${us.Character.Cultivation._level}] ${us.Character.Info._name}\n`
          if(ii >= max || (ii >= 30 && arg1) ){
            ctx.reply(`Тут:\n${users}`)
          }
        })
      }
    })
  })
})

bot.start((ctx) => {
  User.getUser(ctx.update.message.from, (user) => {
    if(user == undefined){
      User.insertUser(new User(ctx.update.message.from),(us)=>{
        Location.getLocationByUser(us,(loc)=>{
          loc.people.push(us.Character.Info._id)
          Location.updateLocation(loc,(tr)=>{
            locationShow(ctx);
          })
        })
      });
    }else{
      locationShow(ctx);
    }
  });
  ctx.reply(`Вы появились в этом мире! \n ${_helpCommands}`)
})
bot.help((ctx) => ctx.reply(`${_helpCommands}`))

bot.on('text', (ctx) => {
  if(ctx.message.entities?.[0].type == 'bot_command'){ //Это go команда (системная)
    var text = ctx.message.text
    text = text.replace('/go_', '')
    User.getUser(ctx.message.from,(us)=>{ 
      var user = Object.assign(new User, us);
      user.muve(text,ctx)
    })
  }
})

//EXEC once
dbWork.createDBandTABLE();
bot.launch()

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))