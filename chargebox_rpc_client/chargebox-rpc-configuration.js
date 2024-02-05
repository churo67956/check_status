module.exports = function (RED) {
  "use strict";
    class ChargeboxRpcConfiguration {
      constructor(n) {
        RED.nodes.createNode(this, n);
        const sessionTimeout = 500;
        this.username = n.username;
        this.password = n.password;
        var node = this;
        node.accessToken = false;
        node.tokenExpires = new Date();

        node.genericCall = (baseUrl, method = "get", body = {}) => {
          return node.doAuthRestCall(baseUrl, method, {}, body).then((json) => {
            return json;
          });
        };
  
        node.doAuthRestCall = (
          baseUrl,
          method = "post",
          headers = {},
          body = {}
        ) => {
          headers = {
            ...headers,
            Accept: "application/json",
            "Content-Type": "application/json",
          };
          const url = "http://" + baseUrl + "/api/ubus";
          const bodyPayload = {
              jsonrpc: "2.0",
              id: 1,
              method: "call",
              params: [
                node.accessToken,
                body.object,
                body.method,
                body.payload
              ]
          }
          if (!node.accessToken) {
            throw new Error("Not logged in");
          }
          const response = fetch( url, {
            method: method,
            headers: headers,
            body: JSON.stringify(bodyPayload),
          })
          .then((response) => {
            if (!response.ok) {
              console.error(
                "[chargebox-rpc-configuration] Could not fetch(): " +
                response.status +
                ": " +
                response.statusText
              );
    
              console.error(text);
    
              throw Error(
                "REST Command failed (" +
                response.status +
                ": " +
                response.statusText +
                "), check console for errors."
              );
            }  
            return response.text();
          })
          .then((text) => {
            try {
              const data = JSON.parse(text);
              node.status({
                fill: "green",
                shape: "dot",
                text: url,
              });
              return data;
            } catch (error) {
              return { status: response.status, statusText: response.statusText };
            }
          })
          .catch((error) => {
            throw new Error(error);
          });
          return response;
        };

        //checkToken function. It will check if the token is expired and if so, it will call the refresh token function
        node.checkToken = (parent) => {
          const expiresIn = Math.floor((node.tokenExpires - new Date()) / 1000);
          if (expiresIn < 0) {
            node.warn("token expired, logging in...");
            parent.status({
              fill: "red",
              shape: "dot",
              text: "Not Logged in",
            });
            return node.doRefreshToken(parent).
            then( (data) => {
              parent.sendToken(node.accessToken);
            })
            .catch((error) => {
              node.warn(error);
            })
            .finally(() => {
              node.checkTokenHandler = setTimeout(() => node.checkToken(parent), 3 * 1000);
            });
          }
          node.checkTokenHandler = setTimeout(() => node.checkToken(parent), 3 * 1000);
          return Promise.resolve("Still logged in");
        };
        //refresh token function. Basically, if the token is expired, it will call the login function
        node.doRefreshToken = (parent) => {
          if (!node.accessToken) {
            console.log(
              "[Ingeteam] ChargeboxRcpConfiguration::doRefreshToken() - No accessToken, exiting"
            );
            return Promise.reject("No accessToken");
          }
          return node.doLogin(parent);
        };
        //login function. It will call the login function of the charger
        node.doLogin = (parent) => {
            const url = "http://" + parent.charger + "/api/ubus";
            const data = {
              jsonrpc: "2.0",
              id: 1,
              method: "call",
              params: [ 
                "00000000000000000000000000000000", 
                "session",
                "login", 
                { userName: node.credentials.username,
                  password: node.credentials.password,
                  timeout: sessionTimeout.toString() }
              ]
            };
            const response =  fetch(url, {
              method: "post",
              body: JSON.stringify(data),
              headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
              },
            })
            .then((response) => response.json())
            .then((json) => {
                if ("result" in json && json.result[0] == 0) {
                  const result = json.result[1];
                  node.accessToken = result.ubus_rpc_session;
                  var t = new Date();
                  t.setSeconds(t.getSeconds() + result.expires);
                  node.timeout = result.timeout
                  node.tokenExpires = t;
                  node.status({
                    fill: "green",
                    shape: "dot",
                    text: url,
                  });
                  node.warn("Logged in");
                  return json;
                }
                throw new Error("Login failed");
            })
            .catch((error) => {
                throw new Error(error);
            });
            node.emit("update", {
              update: "Token retrieved (logged in)",
            });
            return response;
        };
        //get token function. It will call the checkToken function after 2 seconds
        node.getToken = (parent) => {
          node.checkTokenHandler = setTimeout(() => node.checkToken(parent), 2000);
        }
        //close function. It will clear the timeout of the checkToken function
        node.on("close", function () {
          if (node.checkTokenHandler) {
            clearTimeout(node.checkTokenHandler);
          }
        });

      }
    }
    RED.nodes.registerType("chargebox-rpc-configuration", ChargeboxRpcConfiguration, {
      credentials: {
        username: { type: "text" },
        password: { type: "password" },
      },
    });
};
  