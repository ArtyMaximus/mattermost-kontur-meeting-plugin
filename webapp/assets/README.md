# Статические ресурсы webapp

Поместите файл `artem-card.png` в эту папку для отображения в модалке "О плагине".

После добавления файла:
1. Раскомментируйте строку в `webapp/src/components/about_plugin_modal.jsx`:
   ```javascript
   artemCardImage = require('../../assets/artem-card.png');
   ```
2. Пересоберите плагин

Рекомендуемый размер: 150-200px по ширине, формат PNG или JPG.


