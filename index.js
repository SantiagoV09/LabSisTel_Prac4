'use strict'

const client = require('ari-client');

const generarAudio = require('./funciones/gtts');
const convertirAudio = require('./funciones/sox');
const { connection, consultasDB } = require('./db');

//-----------------------------------------------------

let cedula = '';
let datosUsuario = '';
let cedulaU = '';
let fecha = '';
let query = '';
let resultado = '';
let text = '';
let tipoCertificado = '';

const pathAudios = 'sound:/${__dirname}/certificados/audios/gsm/audio';


client.connect('http://localhost:8088', 'asterisk', 'asterisk', clientLoaded);

function clientLoaded(err, ari){
  if (err) {
    throw err; 
  }
  

  ari.on('StasisStart', function (event, incoming) {

    console.log('*****Se ha iniciado la aplicación*****', incoming.name);

    incoming.answer(setTimeout((err) => {
      play(incoming, 'sound:menuIntro')
    }, 3000));

    incoming.on('ChannelDtmfReceived', introMenu);

    async function introMenu(event, channel) {

      const digit = event.digit;

      switch (digit) {
        case '2':    //Consultar Estado Certificado
          incoming.removeListener('ChannelDtmfReceived', introMenu);
          play(channel, 'sound:consulta');
          estado(event, incoming, channel)
          break;

        case '1': //Solicitar Certificado
          incoming.removeListener('ChannelDtmfReceived', introMenu);
          play(channel, 'sound:datosCita');
          certificado(event, incoming);
          break;
       /* case '3': //Agente
            incoming.removeListener('ChannelDtmfReceived', introMenu);
            play(channel, 'sound:agent');
            agente(event, incoming);
        break;*/
        default:
          console.log('default')
          text = 'opción no válida, inténtelo de nuevo'
          await generarAudio(text);
          await convertirAudio();
          play(channel, pathAudios)
          break;
      }
    }

    function estado(event, incoming, channel) {
      cedula = '';
      console.log('---------consulta estado certificado---------');
      incoming.on('ChannelDtmfReceived', consultaEstado);
    }

    function certificado(event, incoming) {
      datosUsuario = '';
      console.log('---------Solicitar Certificado---------');
      incoming.on('ChannelDtmfReceived', solicitudCertificado);
    }

    /*function agente(event, incoming) {
        console.log('---------Agente---------');
        incoming.on('ChannelDtmfReceived', agente);
    }*/

  });


  /**
   *  Initiate a playback on the given channel.
   *
   *  @function play
   *  @memberof example
   *  @param {module:resources~Channel} channel - the channel to send the
   *    playback to
   *  @param {string} sound - the string identifier of the sound to play
   *  @param {Function} callback - callback invoked once playback is finished
   */
  
  function play(channel, sound, callback) {
    var playback = ari.Playback();
    playback.once('PlaybackFinished',
      function (event, instance) {

        if (callback) {
          callback(null);
        }
      });
    channel.play({ media: sound }, playback, function (err, playback) { });
  }

  async function consultaEstado(event, incoming) {

    let dato = event.digit;

    // Grabacion de peticion de cedula y marcacion de #
    switch (dato) {
      case '#':
        incoming.removeListener('ChannelDtmfReceived', consultaEstado);
        query = `SELECT estado FROM certificados WHERE cedulaUsuario = ${cedula} LIMIT 1`

        resultado = await consultasDB(query)
          .then(function (resultado) {

            if (!resultado) return

            switch (resultado.resultado) {
              case 0:
                text = `${resultado.nombre} solicitud pendiente`
                break;

              case 1:
                text = `${resultado.nombre} certificado generado`
                break;

              case 2:
                text = `${resultado.nombre} solicitud rechazada`
                break;

              default:
                break;
            }
          })
          .catch(text = 'La consulta realizada ha sido fallida, intente de nuevo')

        await generarAudio(text);
        await convertirAudio()

        query = '';
        await play(incoming, pathAudios);
        incoming.removeListener('ChannelDtmfReceived', agendarCita);

        setTimeout(function () {
          colgarLLamada(incoming);
        }, 5000)

        break;

      case '*':
        console.log('---------consulta estado certificado---------');
        cedula = '';
        incoming.removeListener('ChannelDtmfReceived', consultaEstado);
        incoming.on('ChannelDtmfReceived', consultaEstado)
        break

      default:
        cedula += dato;
        console.log('guardando cedula');
        console.log(cedula);
        break;
    }
  }


  async function solicitudCertificado(event, incoming) {

    let dato = event.digit;

    switch (dato) {
      case '#':
        incoming.removeListener('ChannelDtmfReceived', solicitudCertificado);

        datosUsuario = datosUsuario.split('*');
        cedulaU = datosUsuario[0];
        codigo = datosUsuario[1];
        tipoCertificado = datosUsuario[2];

        query = `INSERT INTO certificados (cedulaUsuario, tipoCertificado, estado, codigo) VALUES ('${cedulaU}', '${tipoCertificado}', '0','${codigo}')`;

        await consultasDB(query)
          .then(async function () {

            text = 'Su certificado ha sido solicitado correctamente.'
          })
          .catch(function () {
            text = 'No se ha podido generar certificado, inténtelo de nuevo'
          });

        await generarAudio(text);
        await convertirAudio()
        await play(incoming, pathAudios);


        await setTimeout(function () {
          colgarLLamada(incoming);
        }, 5000)

        query = '';
        cedulaU = '';
        codigo = '';
        tipoCertificado = '';
        datosUsuario = '';
        break;

      default:
        datosUsuario += dato;
        console.log('guardando datos de cita');
        console.log(datosUsuario);
        break;
    }
  }

  function colgarLLamada(incoming) {
    setTimeout(function () {
      incoming.hangup()
    }, 2000);
  }

  ari.start('certificados');

}