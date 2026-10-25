# Grafana con la identidad de SmartEgg: logo, favicon, título, hoja de estilos
# propia y los plugins de paneles instalados en la imagen con versión fija.
FROM grafana/grafana:13.2.0

ENV GF_PATHS_PLUGINS=/opt/smartegg/plugins

USER root
RUN mkdir -p "$GF_PATHS_PLUGINS" \
 && for plugin in \
      grafana-mqtt-datasource@1.3.6 \
      marcusolsson-dynamictext-panel@6.3.0 \
      volkovlabs-echarts-panel@7.2.5 \
      grafana-polystat-panel@2.1.16 \
      grafana-clock-panel@3.2.4; do \
      grafana cli --pluginsDir "$GF_PATHS_PLUGINS" plugins install \
        "${plugin%@*}" "${plugin#*@}"; \
    done \
 && chown -R grafana:root "$GF_PATHS_PLUGINS"

COPY branding/smartegg-mark.svg /usr/share/grafana/public/img/grafana_icon.svg
COPY branding/fav32.png /usr/share/grafana/public/img/fav32.png
COPY branding/apple-touch-icon.png /usr/share/grafana/public/img/apple-touch-icon.png
COPY branding/smartegg.css /usr/share/grafana/public/smartegg/smartegg.css
COPY branding/smartegg-mark.svg /usr/share/grafana/public/smartegg/smartegg-mark.svg
# El menú y el login usan la copia con hash que genera webpack.
RUN for icon in /usr/share/grafana/public/build/static/img/grafana_icon.*.svg; do \
      cp /usr/share/grafana/public/img/grafana_icon.svg "$icon"; \
    done

# index.html no tiene un punto de extensión en la edición OSS: se cambia el
# título y se carga la hoja de estilos al final del <head>.
RUN sed -i \
      -e 's|<title>\[\[.AppTitle\]\]</title>|<title>SmartEgg · Observatorio</title>|' \
      -e 's|</head>|<link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500\&family=Space+Grotesk:wght@400;500;600;700\&display=swap" /><link rel="stylesheet" href="public/smartegg/smartegg.css" /></head>|' \
      /usr/share/grafana/public/views/index.html \
 && grep -q 'smartegg.css' /usr/share/grafana/public/views/index.html

USER grafana
