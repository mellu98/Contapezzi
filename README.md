# Contapezzi Turno

PWA per seguire un turno reale da 8 ore con media teorica di 600 pezzi/ora.

## Funzioni

- avvio turno e stato `Fermo` macchina
- conteggio pezzi teorici in tempo reale
- target turno dinamico che scende durante il fermo
- conteggio pezzi giustificati dal fermo
- contatore opzionale dei pezzi reali con confronto rispetto al ritmo
- salvataggio locale dello stato
- manifest e service worker per installazione e uso offline

## Avvio locale

Apri un server statico nella cartella del progetto:

```powershell
python -m http.server 8080
```

Poi apri `http://localhost:8080`.

## Deploy su Render

Il progetto include `render.yaml` per un deploy come static site. Dopo il push su GitHub:

1. collega il repository a Render
2. crea un nuovo servizio da Blueprint oppure Static Site
3. usa la root del repository come publish path

Una volta online, apri il link Render dal telefono e installa la PWA dal browser.
