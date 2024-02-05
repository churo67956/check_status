module.exports = function (RED) {
    "use strict";
  
    class ChargeboxRpcClient {
      constructor(n) {
        RED.nodes.createNode(this, n);
        var node = this;
        node.charger = n.charger;
        node.configurationNode = n.configuration;
        node.connectionConfig = RED.nodes.getNode(node.configurationNode);
        const times = {login : 0};
        if (!node.connectionConfig) {
          node.error("Missing Ingeteam chargebox rpc configuration");
          return;
        }
        node.sendToken =  (token) => {
          node.status({
            fill: "green",
            shape: "dot",
            text: "Logged in",
          });
          node.send({
            payload: token,
          });
        }
        // REST API POST COMMAND (wrapper)
        node.POST =  (url, body = {}) => {
          node.warn(url);
          node.warn(JSON.stringify(body));
          node.status({
            fill: "yellow",
            shape: "dot",
            text: "POST: sending",
          });
          return node.connectionConfig
            .genericCall(url, "post", body)
            .then((response) => {
              node.status({
                fill: "green",
                shape: "dot",
                text: "POST: ok",
              });
              node.send({
                topic: url,
                payload: response,
              });
              return response;
            })
            .catch((error) => {
              node.warn(url + " POST failed: " + error);
              node.status({
                fill: "red",
                shape: "dot",
                text: "POST: failed",
              });
              return error;
            });
        };   

        node.on("input", function (msg, send, done) {
          if (msg.topic == "login") {
            node.charger = msg?.charger ?? n.charger;
            times.login += 1 ;
            node.warn("Topic login");
            if (times.login == 1){
              node.connectionConfig.doLogin(node)
              .then(() => {
                node.sendToken(node.connectionConfig.accessToken);
              })
              .catch((error) => {
                node.status({
                  fill: "red",
                  shape: "dot",
                  text: "Not Logged in",
                });
                node.warn(error);
              });
            }
            else{
              node.connectionConfig.checkToken(node);
            }
          }
          else if (msg.topic == "status"){
            const body = {
              object: "wizard",
              method : "etl_hmi",
              payload: {"connector": msg.payload.logical_connector}
            };
            node.POST(node.charger, body);
          }
        });
        //node.connectionConfig.getToken(node);
      }
    }
    RED.nodes.registerType("chargebox-rpc-client", ChargeboxRpcClient);
  };
  