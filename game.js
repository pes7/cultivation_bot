const { Telegraf } = require('telegraf')
const { log } = require('console');
const { brotliCompress } = require('zlib');
const arGs = require('./commandArgs');
const MongoClient = require("mongodb").MongoClient;
const fs = require('fs');
const { ifError } = require('assert');

const token = "1063342985:AAHvN1QdZUt90BAsdo-Qc3as7pGz-HaspNA";
const bot = new Telegraf(token)

bot.use(arGs());

/*MONGO*/
const _DB = "Bot";
const _tables = {
  _usersTable:"Users",
  _sectTable:"Sects",
  _wildTable:"Wild",
  _location:"Location",
  _battle:"Battle"
};
const _setting = { useUnifiedTopology: true,connectTimeoutMS: 30000,keepAlive: 1 };
const _url = 'mongodb://root:password@localhost:27017/';

/*INFO*/
const _helpCommands = 
`{xxx} - {} не писать, пишите значение заместо вставки.
У всех команд есть, сокращения, найдите их.
/cultivate {t} - Культивировать сколько секунд.
/immortals - Покажет топ культиваторов и их уровень.
/location - Где вы находитесь?
/clCancle - Отменить культивацию! (Очень опасно, вы можете потерять свой прогресс культивации).
`

class User {
  static table = _tables._usersTable;
  static NAMES;
  Character = {
    Info:{_id:0,_name:'',_loc:'d_ShanSci'},
    Cultivation:{_level:0,_points:0},
    TimeOut:{_cultivate:0},
    Interval:{_cultivate_update:0}
  }
  constructor(from) {
    this.Character.Info._id = from?.id;
    this.Character.Info._name = from?.first_name;
  }
}

const _defender_types = {
  _player:"Player",
  _bot:"Bot"
}
class Battle{
  static name = _tables._battle;
  Battle = {
    _attaker:'',
    _defender:'',
    _defender_type:'',
    _attaker_hp:0,
    _defender_hp:0,
    _attaker_timer:0,
    _defender_timer:0
  }
}

class Location {
  static table = _tables._location;
  static getLocationByUser(us, clb){
    const mongoClient = new MongoClient(_url, _setting);
    mongoClient.connect(function(err, client){
      if(err) return console.log(err);
      const db = client.db(_DB);
      db.collection(Location.table).findOne({n:us.Character.Info._loc}, function(err, result) {
        if (err) throw err;
        client.close();
        clb(result);
      });
    });
  }
}

class Wild {
  static table = _tables._wildTable;
  static getWildByName(na, clb){
    const mongoClient = new MongoClient(_url, _setting);
    mongoClient.connect(function(err, client){
      if(err) return console.log(err);
      const db = client.db(_DB);
      db.collection(Wild.table).findOne({n:na}, function(err, result) {
        if (err) throw err;
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
    dbWork.creatTable(Wild.table, () => {
      /*Load JSON*/
      const ww = JSON.parse(fs.readFileSync('json/wild.json', 'utf8'));
      var ii = Object.keys(ww).map(key => {
        return ww[key];
      })
      const mongoClient = new MongoClient(_url, _setting);
      mongoClient.connect(function(err, client){
        const db = client.db(_DB);
        const collection = db.collection(Wild.table);
        collection.insertMany(ii, function(err, result){
            if(err){ 
                return console.log(err);
            }
            client.close();
        });
      });
    });
    dbWork.creatTable(Location.table, () => {
      /*Load JSON*/
      const ww = JSON.parse(fs.readFileSync('json/location.json', 'utf8'));
      var ii = Object.keys(ww).map(key => {
        return ww[key];
      })
      const mongoClient = new MongoClient(_url, _setting);
      mongoClient.connect(function(err, client){
        const db = client.db(_DB);
        const collection = db.collection(Location.table);
        collection.insertMany(ii, function(err, result){
            if(err){ 
                return console.log(err);
            }
            client.close();
        });
      });
    });
  }

  static creatTable(table, clb = undefined){
    console.log(`Check ${table}`)
    const client = new MongoClient(_url,_setting);
    client.connect(function(err) {
      if (err) { console.log(`Database ${_DB} not EXIST!!! Create IT NOW!!!!`); return false; };
      var db = client.db(_DB);
        db.createCollection(table, function(err, res) {
          if (err?.code != 48) {console.log(err); clb ? clb(): console.log(`${table} no clb`); }
          console.log(`Collection ${table} created!`);
          client.close();
        });
    });
  }

  static insertUser(user) {
    const mongoClient = new MongoClient(_url, _setting);
    mongoClient.connect(function(err, client){
        const db = client.db(_DB);
        const collection = db.collection(User.table);
        collection.insertOne(user, function(err, result){
            if(err){ 
                return console.log(err);
            }
            client.close();
        });
    });
  }

  static updateUser(user, clb = (tr)=>{ console.log(`Update: ${tr}`) }){
    const mongoClient = new MongoClient(_url, _setting);
    mongoClient.connect(function(err, client){
      if (err) throw err;
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
      if(err) return console.log(err);
      const db = client.db(_DB);
      db.collection(User.table).findOne({'Character.Info._id':from?.id}, function(err, result) {
        if (err) throw err;
        client.close();
        clb(result);
      });
    });
  }

  static getTopUsers(clb){
    const mongoClient = new MongoClient(_url, _setting);
    mongoClient.connect(function(err, client){
      if(err) return console.log(err);
      const db = client.db(_DB);
      db.collection(User.table).find({'Character.Cultivation._points': {$exists: true}}).sort({'Character.Cultivation._points' : -1}).limit(10).toArray(function(err, result) {
        if (err) throw err;
        client.close();
        clb(result);
      })
    });
  }
}

bot.command('me', (ctx) => {
  dbWork.getUser(ctx.update.message.from,(user)=>{
    console.log(user);
  })
})

bot.command(['cultivate','cult','c'], (ctx) => {
  dbWork.getUser(ctx.update.message.from, (user)=>{
    if(user == undefined) {ctx.reply('Культивация невозможна, используйте: /start'); return false;}
    if(user.Character.TimeOut._cultivate != 0) // Если уже культивируем
    { 
      ctx.reply('Я уже культивирую! Хочешь отменить? \n/clCancle');
      return false;
    } 
    //Аргументы
    var time_arg = ctx.state.command.args[0];
    if(time_arg == null || time_arg == undefined || time_arg == 0) {time_arg=30}
    console.log(`id: ${ctx.update.message.from?.id} name: ${ctx.update.message.from?.first_name} time: ${time_arg}`);
    var time = parseInt(time_arg);
    time = time * 1000;

    //Начинаем
    var s = ctx.reply(`Культивирую: ${time_arg}`);
    s.then((x)=>{
      var m_id = x.message_id;
      var c_id = x.chat.id;
      var _time_pass = 0;
      let _iterv = setInterval((m,c)=>{
        _time_pass++;
        ctx.telegram.editMessageText(c,m,m,`Культивирую: ${time_arg - _time_pass}`);
      },1000,m_id,c_id)
      user.Character.Interval._cultivate_update = parseInt(_iterv);
      dbWork.updateUser(user, (result) => {
          //По окончанию
          function endCultivate(arg) {
            dbWork.getUser(ctx.update.message.from,(us)=>{
              arg.reply(`Культивация окончена!`);
              clearInterval(_iterv);
              us.Character.Cultivation._points = us.Character.Cultivation._points + time/1000;
              us.Character.TimeOut._cultivate = 0; //Чистим таймаут!
              us.Character.Interval._cultivate_update = 0;
              dbWork.updateUser(us, (tr)=>{ console.log(`cultivate update ${us.Character.Info._name}: ${tr}`) });
              console.log(`Name: ${us.Character.Info._name}, score: ${us.Character.Cultivation._points}`)
            })
          }
          //Сначало это. Моментное действие, user не перечитем.
          let timeout = setTimeout(endCultivate, time, ctx);
          user.Character.TimeOut._cultivate = parseInt(timeout);
          dbWork.updateUser(user);
      });
    })
  })
})

bot.command(['clCancle','cl'], (ctx) => {
  dbWork.getUser(ctx.update.message.from, (user) => {
    if(user != undefined){
      if(user.Character.TimeOut._cultivate != 0){
        clearTimeout(user.Character.TimeOut._cultivate);
        clearInterval(user.Character.Interval._cultivate_update);
        user.Character.TimeOut._cultivate = 0;
        user.Character.Interval._cultivate_update = 0;
        dbWork.updateUser(user, (tr)=>{ ctx.reply('Культивация прервана - прогресс утерян...'); console.log(`cultivate cancle ${user.Character.Info._name}: ${tr}`) });
      }else{ctx.reply('Что отменять то? Вы и так не культивируете, лодрь!');}
    }
  })
})

bot.command(['loc','location','loca'], (ctx) => {
  dbWork.getUser(ctx.update.message.from,(user)=>{
    if(user != undefined){
      Location.getLocationByUser(user,(loc)=>{
        var names = 'никто'
        if(Object.keys(loc.wild).length > 0){
          names = ''
          var ii = 0;
          for (var w of loc.wild) {
            ii++;
            Wild.getWildByName(w, (wild)=>{
              if(wild != undefined) {names = `${names}${wild.name} `}
              if(names.length < 1) {names = 'никто'}
              if(ii >= Object.keys(loc.wild).length) {
                ctx.reply(
                  `Вы находетесь в локации: ${loc.name}\nЭто: ${loc.desc}\nТут водятся: ${names}`
                );
              }
            })
          }
        }
      })
    }else{ctx.reply('Ваша душа витает на створках мироздания.')}
  })
})

bot.command(['immortals','im','imm'], (ctx) => {
  ctx.reply('Топ безсмертных мира сего:');
  dbWork.getTopUsers((users)=>{
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

bot.start((ctx) => {
  dbWork.getUser(ctx.update.message.from, (user) => {
    if(user == undefined){
      dbWork.insertUser(new User(ctx.update.message.from));
    }
  });
  ctx.reply(`Это культиваторский бот. \n НАЧНИ СВОЮ КУЛЬТИВАЦИЮ!!! \n ${_helpCommands}`)
})
bot.help((ctx) => ctx.reply(`${_helpCommands}`))

bot.on('text', (ctx) => {
  //console.log(ctx)
  //const scores = ctx.db.getScores(ctx.message.from.username)
  //return ctx.reply(`${ctx.message.from.username}: ${scores}`)
})

//EXEC once
dbWork.createDBandTABLE();
bot.launch()

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))