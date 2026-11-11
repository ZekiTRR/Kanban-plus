// русский
import { Lang } from './en';

const lang: Partial<Lang> = {
  // main.ts
  'Open as kanban board': 'Открыть как Kanban-доску',
  'Create new board': 'Создать новую доску',
  'Archive completed cards in active board': 'Архивировать завершённые карточки в активной доске',
  'Error: current file is not a Kanban board': 'Ошибка: текущий файл не является Kanban-доской',
  'Convert empty note to Kanban': 'Конвертировать пустую заметку в Kanban',
  'Error: cannot create Kanban, the current note is not empty':
    'Ошибка: невозможно создать Kanban, текущая заметка не пуста',
  'New kanban board': 'Новая Kanban-доска',
  'Untitled Kanban': 'Безымянная Kanban-доска',
  'Toggle between Kanban and markdown mode': 'Переключиться между Kanban и markdown режимами',

  // KanbanView.tsx
  'Open as markdown': 'Открыть как markdown',
  'Open board settings': 'Открыть настройки доски',
  'Archive completed cards': 'Архивировать завершённые карточки',
  'Something went wrong': 'Что-то пошло не так',
  'You may wish to open as markdown and inspect or edit the file.':
    'Вы можете открыть файл как markdown и проверить или отредактировать его.',
  'Are you sure you want to archive all completed cards on this board?':
    'Вы уверены, что хотите архивировать все завершёённые карточки в этой доске?',

  // parser.ts
  Complete: 'Выполнено',
  Archive: 'Архивировать',
  'Invalid Kanban file: problems parsing frontmatter':
    'Неверный файл Kanban: не удаётся парсинг frontmatter',
  "I don't know how to interpret this line:": 'Я не знаю, как интерпретировать эту строку:',
  Untitled: 'Без имени', // auto-created column

  // settingHelpers.ts
  'Note: No template plugins are currently enabled.':
    'Примечание: В настоящее время ни один плагин шаблона не включен.',
  default: 'по умолчанию',
  'Search...': 'Найти...',

  // Settings.ts
  'New line trigger': 'Триггер новой строки',
  'Select whether Enter or Shift+Enter creates a new line. The opposite of what you choose will create and complete editing of cards and lists.':
    'Выберите, будет ли создаваться новая строка с помощью Enter или Shift+Enter. Противоположность тому, что вы выберете, позволит создать и завершить редактирование карточек и списков.',
  'Shift + Enter': 'Shift + Enter',
  Enter: 'Enter',
  'Prepend / append new cards': 'Положение новых карточек',
  'This setting controls whether new cards are added to the beginning or end of the list.':
    'Эта настройка управляет положением новых карточек, в начале или в конце списка.',
  Prepend: 'В начале',
  'Prepend (compact)': 'В начале (компактно)',
  Append: 'В конце',
  'These settings will take precedence over the default Kanban board settings.':
    'Эти настройки будут иметь приоритет над настройками доски Kanban по умолчанию.',
  'Set the default Kanban board settings. Settings can be overridden on a board-by-board basis.':
    'Установите настройки доски Kanban по умолчанию. Настройки можно переопределить для каждой доски.',
  'Note template': 'Шаблон заметки',
  'This template will be used when creating new notes from Kanban cards.':
    'Этот шаблон будет использоваться при создании новых заметок из карточек Kanban.',
  'No template': 'Нет шаблона',
  'Note folder': 'Директория заметок',
  'Notes created from Kanban cards will be placed in this folder. If blank, they will be placed in the default location for this vault.':
    'В эту папку будут помещены заметки, созданные из карточек Kanban. Если поле пустое, они будут помещены в папку по умолчанию для этого хранилища.',
  'Default folder': 'Директория по умолчанию',
  'List width': 'Ширина списка',
  'Enter a number to set the list width in pixels.':
    'Введите число, чтобы установить ширину списка в пикселях.',
  'Maximum number of archived cards': 'Максимальное количество архивированных карточек',
  "Archived cards can be viewed in markdown mode. This setting will begin removing old cards once the limit is reached. Setting this value to -1 will allow a board's archive to grow infinitely.":
    'Архивированные карточки можно просмотреть в режиме markdown. Эта настройка начнет удалять старые карточки после достижения лимита. Установка этого значения на -1 позволит архиву доски расти бесконечно.',
  'Display card checkbox': 'Показывать флажок карточки',
  'When toggled, a checkbox will be displayed with each card':
    'Когда включено, для каждой карточки будет показан флажок',
  'Reset to default': 'Сбросить настройки',
  'Date & Time': 'Дата и время',
  'Date trigger': 'Триггер даты',
  'When this is typed, it will trigger the date selector': 'Ввод активирует выбор даты',
  'Time trigger': 'Триггер времени',
  'When this is typed, it will trigger the time selector': 'Ввод активирует выбор времени',
  'Date format': 'Формат даты',
  'This format will be used when saving dates in markdown.':
    'Этот формат будет использован при сохранении дат в markdown.',
  'For more syntax, refer to': 'Полный синтаксис смотрите на',
  'format reference': 'справка по формату',
  'Your current syntax looks like this': 'Ваш текущий синтаксис выглядит так',
  'Time format': 'Формат времени',
  'Date display format': 'Формат показа даты',
  'This format will be used when displaying dates in Kanban cards.':
    'Этот формат будет использован при показе дат в Kanban-карточках.',
  'Show relative date': 'Показывать относительную дату',
  'Hide card counts in list titles': 'Скрыть счётчики карточек в заголовках списка',
  'When toggled, card counts are hidden from the list title':
    'Когда включено, счётчики карточек скрыты в заголовках списка',
  'Link dates to daily notes': 'Связывать даты с ежедневными заметками',
  'When toggled, dates will link to daily notes. Eg. [[2021-04-26]]':
    'Когда включено, даты будут указывать на ежедневные заметки. Например, [[2021-04-26]]',
  'Add date and time to archived cards': 'Добавлять дату и время к архивированным карточкам',
  'When toggled, the current date and time will be added to the card title when it is archived. Eg. - [ ] 2021-05-14 10:00am My card title':
    'Когда включено, текущие дата и время будут добавлены к заголовку карточки, когда она заархивирована. Например, - [ ] 2021-05-14 10:00am Мой заголовок карточки',
  'Add archive date/time after card title':
    'Добавлять дату/время архивирования после заголовка карточки',
  'When toggled, the archived date/time will be added after the card title, e.g.- [ ] My card title 2021-05-14 10:00am. By default, it is inserted before the title.':
    'Когда включено, дата и время архивирования будет добавлено после заголовка карточки, например, - [ ] Мой заголовок карточки 2021-05-14 10:00am. По умолчанию добавление производится перед заголовком.',
  'Archive date/time separator': 'Разделитель даты/времени архивирования',
  'This will be used to separate the archived date/time from the title':
    'Будет использоваться для отделения даты/времени архивирования от заголовка',
  'Archive date/time format': 'Формат даты/времени архивирования',
  'Kanban Plugin': 'Плагин Kanban',
  'Tag colors': 'Показывать цвета меток',
  'Set colors for tags displayed in cards.': 'Установить цвета для меток под заголовками карточек.',
  'Linked Page Metadata': 'Метаданные связанных страниц',
  'Display metadata for the first note linked within a card. Specify which metadata keys to display below. An optional label can be provided, and labels can be hidden altogether.':
    'Отображение метаданных для первой заметки, связанной с карточкой. Ниже укажите, какие ключи метаданных отображать. Можно указать дополнительную метку, либо скрыть метки полностью.',
  'Board Header Buttons': 'Кнопки заголовка доски',
  'Calendar: first day of week': 'Календарь: первый день недели',
  'Override which day is used as the start of the week':
    'Укажите, какой день должен использоваться как начало недели',
  Sunday: 'Воскресенье',
  Monday: 'Понедельник',
  Tuesday: 'Вторник',
  Wednesday: 'Среда',
  Thursday: 'Четверг',
  Friday: 'Пятница',
  Saturday: 'Суббота',
  'Background color': 'Цвет фона',
  Tag: 'Метка',
  'Text color': 'Цвет текста',
  'Date is': 'Дата',
  Today: 'Сегодня',
  'After now': 'После текущего момента',
  'Before now': 'До текущего момента',
  'Between now and': 'Между сейчас и',
  'Display date colors': 'Показывать цвета даты',
  'Set colors for dates displayed in cards based on the rules below.':
    'Установить цвета для даты, отображаемой под карточкой, базируясь на правилах ниже',
  'Add date color': 'Добавить цвет даты',

  // MetadataSettings.tsx
  'Metadata key': 'Ключ метаданных',
  'Display label': 'Показать ярылк',
  'Hide label': 'Спрятать ярлык',
  'Drag to rearrange': 'Потяните, чтобы переупорядочить',
  Delete: 'Удалить',
  'Add key': 'Добавить ключ',
  'Field contains markdown': 'Поле содержит markdown',

  // TagColorSettings.tsx
  'Add tag color': 'Добавить цвет метки',

  // components/Item/Item.tsx
  'More options': 'Больше настроек',
  Cancel: 'Отмена',

  // components/Item/ItemContent.tsx
  today: 'сегодня',
  yesterday: 'вчера',
  tomorrow: 'завтра',
  'Change date': 'Изменить дату',
  'Change time': 'Изменить время',

  // components/Item/ItemForm.tsx
  'Card title...': 'Заголовок карточки...',
  'Add card': 'Добавить карточку',
  'Add a card': 'Добавить карточку',

  // components/Item/ItemMenu.ts
  'Edit card': 'Редактировать карточку',
  'New note from card': 'Новая заметка из карточки',
  'Archive card': 'Архивировать карточку',
  'Delete card': 'Удалить карточку',
  'Edit date': 'Редактировать дату',
  'Add date': 'Добавить дату',
  'Remove date': 'Удалить дату',
  'Edit time': 'Редактировать время',
  'Add time': 'Добавить время',
  'Remove time': 'Удалить время',
  'Duplicate card': 'Дублировать карточку',
  'Split card': 'Разделить карточку',
  'Copy link to card': 'Скопировать ссылку на карточку',
  'Insert card before': 'Вставить карточку до',
  'Insert card after': 'Вставить карточку после',
  'Add label': 'Добавить ярлык',
  'Move to top': 'Переместить вверх',
  'Move to bottom': 'Переместить вниз',

  // components/Lane/LaneForm.tsx
  'Enter list title...': 'Введите заголовок списка...',
  'Mark cards in this list as complete': 'Отметить карточки в этом списке как завершённые',
  'Add list': 'Добавить список',
  'Add a list': 'Добавить список',

  // components/Lane/LaneHeader.tsx
  'Move list': 'Переместить список',
  Close: 'Закрыть',

  // components/Lane/LaneMenu.tsx
  'Are you sure you want to delete this list and all its cards?':
    'Вы уверены, что хотите удалить этот список и все его карточки?',
  'Yes, delete list': 'Да, удалить список',
  'Are you sure you want to archive this list and all its cards?':
    'Вы уверены, что хотите архивировать этот список и все его карточки?',
  'Yes, archive list': 'Да, архивировать список',
  'Are you sure you want to archive all cards in this list?':
    'Вы уверены, что хотите архивировать все карточки в этом списке?',
  'Yes, archive cards': 'Да, архивировать карточки',
  'Edit list': 'Редактировать список',
  'Archive cards': 'Архивировать карточки',
  'Archive list': 'Архивировать список',
  'Delete list': 'Удалить список',
  'Insert list before': 'Вставить список до',
  'Insert list after': 'Вставить список после',
  'Sort by card text': 'Сортировать по тексту карточки',
  'Sort by date': 'Сортировать по дате',

  // components/helpers/renderMarkdown.ts
  'Unable to find': 'Невозможно найти',
  'Open in default app': 'Открыть в приложении по умолчанию',

  // components/Editor/MarkdownEditor.tsx
  Submit: 'Сохранить',

  // Kanban Plus
  'Kanban Plus': 'Kanban Plus',
  Color: 'Цвет',
  'Custom color': 'Свой цвет',
  'Remove color': 'Убрать цвет',
  Overdue: 'Просрочено',
  'Next 7 days': '7 дней',
  'Clear filters': 'Сбросить фильтры',
  'Add checklist': 'Добавить чек-лист',
  'Detach lane': 'Открепить список',
  'Snap lane back': 'Вернуть список в ряд',
  'View as calendar': 'Вид: календарь',
  Previous: 'Назад',
  Next: 'Вперёд',
  Month: 'Месяц',
  Week: 'Неделя',
  Unscheduled: 'Без даты',
  'Color lanes': 'Цветные списки',
  'When toggled, lanes with an assigned color will be tinted.':
    'Если включено, списки с назначенным цветом будут окрашены.',
  'Tint lane body': 'Окрашивать фон списка',
  'When toggled, the lane color is applied to the lane body as well as the lane header.':
    'Если включено, цвет списка применяется и к фону списка, а не только к заголовку.',
  'Color cards': 'Цветные карточки',
  'When toggled, cards with an assigned color will be highlighted.':
    'Если включено, карточки с назначенным цветом будут выделены.',
  'Card color style': 'Стиль цвета карточки',
  'How card colors are displayed: a strip on top of the card or the full card background.':
    'Как отображается цвет карточки: полоса сверху или весь фон карточки.',
  Strip: 'Полоса',
  'Full background': 'Весь фон',
  'Show filter bar': 'Показывать панель фильтров',
  'When toggled, a filter bar is displayed above the board with quick filters for tags and due dates.':
    'Если включено, над доской отображается панель быстрых фильтров по тегам и датам.',
  'Show checklist progress': 'Прогресс чек-листов',
  'When toggled, cards containing markdown checkboxes display a progress counter and bar.':
    'Если включено, карточки с чекбоксами показывают счётчик и полосу прогресса.',
  'Enable animations': 'Включить анимации',
  'When toggled, cards and lanes are animated: hover effects, drag physics and more.':
    'Если включено, карточки и списки анимируются: эффекты наведения, физика перетаскивания и др.',
  'Allow free-floating lanes': 'Разрешить свободные списки',
  'When toggled, a lane can be dropped outside the lane row to leave it floating anywhere on the board. Clicking a floating lane or its magnet button snaps it back into the row.':
    'Если включено, список можно перетащить за пределы ряда и оставить плавающим в любом месте доски. Клик по плавающему списку или кнопке-магниту возвращает его в ряд.',
  'Enable board zoom': 'Масштаб доски',
  'When toggled, the board can be zoomed with Ctrl + mouse wheel (or Cmd on macOS), two-finger pinch on touch screens, and the - / + buttons on the board.':
    'Если включено, доску можно масштабировать Ctrl + колесо мыши (Cmd на macOS), щипком двумя пальцами на сенсорных экранах и кнопками − / + на доске.',
  'Zoom out': 'Уменьшить',
  'Zoom in': 'Увеличить',
  'Reset zoom': 'Сбросить масштаб',
  'Set period': 'Задать срок',
  'Clear period': 'Убрать срок',
  'Period start': 'Начало срока',
  'Period end': 'Конец срока',
  'Pick the first and the last day of the period.':
    'Укажите первый и последний день срока.',
  'Invalid start date': 'Некорректная дата начала',
  'Invalid end date': 'Некорректная дата конца',
  'The period end must not be before its start.': 'Конец срока не может быть раньше его начала.',
  'Click to edit the period': 'Нажмите, чтобы изменить срок',
  Period: 'Срок',
  'Drop a card here to set it as the period':
    'Перетащите карточку сюда, чтобы задать этот срок',
  'Add to inbox': 'Добавить во входящие',
  'New cards will land in the inbox list.': 'Новые карточки попадут в список «Входящие».',
  'Card added to inbox': 'Карточка добавлена во входящие',
  'Cards added': 'Добавлено карточек',
  'New line': 'Новая строка',
  'Open a Kanban board first': 'Сначала откройте доску Kanban',
  'Inbox is disabled in board settings.': 'Входящие отключены в настройках доски.',
  'Move to inbox': 'Переместить во входящие',
  'Move all cards to': 'Переместить все карточки в',
  'Hide inbox': 'Скрыть входящие',
  'Enable Inbox': 'Входящие (Inbox)',
  'Adds a dedicated Inbox list and a quick-capture dialog for new cards.':
    'Добавляет отдельный список «Входящие» и быстрое добавление карточек.',
  'Inbox list name': 'Название списка входящих',
  'Name of the list used as Inbox.': 'Название списка, который считается входящими.',
  Inbox: 'Входящие',
  'Image path...': 'Путь к изображению...',
  Background: 'Фон',
  Gradient: 'Градиент',
  Image: 'Изображение',
  'Remove background': 'Убрать фон',
  Apply: 'Применить',
  'Custom gradient': 'Свой градиент',
  'Choose image': 'Выбрать изображение',
  'Darken image': 'Затемнить изображение',
  Font: 'Шрифт',
  'Reset font': 'Сбросить шрифт',
  'Lane background': 'Фон списка',
  'Lane font': 'Шрифт списка',
  'Card background': 'Фон карточки',
  'Card font': 'Шрифт карточки',
  'Board background': 'Фон доски',
  'Board font': 'Шрифт доски',
  Appearance: 'Оформление',
  'Expand all lists': 'Развернуть все списки',
  'Collapse all lists': 'Свернуть все списки',
  'Default font': 'Шрифт по умолчанию',
  'Font family used by boards by default. A board or a card/list can override it in its appearance menu.':
    'Шрифт, который доски используют по умолчанию. Доска, карточка или список могут переопределить его в меню оформления.',
  Planner: 'Планировщик',
  Board: 'Доска',
  'Card not found': 'Карточка не найдена',
  'Moved to': 'Перемещено в',
  Description: 'Описание',
  'Add a more detailed description...': 'Добавьте подробное описание...',
  Checklist: 'Чек-лист',
  Comment: 'Комментарий',
  Add: 'Добавить',
  'Add a checklist item...': 'Добавить пункт чек-листа...',
  'Comments & events': 'Комментарии и события',
  Comments: 'Комментарии',
  'No comments yet.': 'Пока нет комментариев.',
  'Write a comment...': 'Напишите комментарий...',
  'No comments or events yet.': 'Пока нет комментариев и событий.',
  You: 'Вы',
  Activity: 'Событие',
  'Open card': 'Открыть карточку',
  Labels: 'Метки',
  Dates: 'Даты',
  'No tags yet': 'Пока нет тегов',
  'Find or create a label...': 'Найти или создать метку...',
  'Show details': 'Показать подробности',
  'Reset text color': 'Сбросить цвет текста',
  Vault: 'Хранилище',
  URL: 'Ссылка',
  'Local file': 'Локальный файл',
  'Choose file': 'Выбрать файл',
  'Please enter the file path manually.': 'Введите путь к файлу вручную.',
  'Set WIP limit': 'Установить лимит WIP',
  'Remove WIP limit': 'Убрать лимит WIP',
  'WIP limit reached': 'Лимит WIP достигнут',
  'WIP limit exceeded': 'Лимит WIP превышен',
  'Timeline view': 'Вид «Timeline»',
  'Timeline scale': 'Масштаб Timeline',
  Timeline: 'Timeline',
  Swimlanes: 'Дорожки',
  'Swimlanes off': 'Выкл. дорожки',
  Projects: 'Проекты',
  Categories: 'Категории',
  'Custom field': 'Поле',
  Expand: 'Развернуть',
  Collapse: 'Свернуть',
  'Card cover': 'Обложка карточки',
  'Remove cover': 'Убрать обложку',
  'Cover height': 'Высота обложки',
  'Image position': 'Положение изображения',
  'Image fit': 'Отображение изображения',
  Cover: 'Заполнить',
  Contain: 'Вписать',
  Top: 'Сверху',
  'Top center': 'Сверху по центру',
  'Top right': 'Сверху справа',
  Left: 'Слева',
  Center: 'По центру',
  Right: 'Справа',
  Bottom: 'Снизу',
  'Bottom center': 'Снизу по центру',
  'Bottom right': 'Снизу справа',
  'Card title': 'Название карточки',
  'Mini Map': 'Мини-карта',
  'Show a miniature of the whole board with the current viewport in a corner.':
    'Показать миниатюру всей доски с текущей областью просмотра.',
  'WIP warnings': 'Предупреждения WIP',
  'Warn when a card is moved into a list that is already at its WIP limit.':
    'Предупреждать при перемещении карточки в список с достигнутым лимитом WIP.',
  'Enforce WIP limits': 'Принудительные лимиты WIP',
  'When toggled, cards cannot be moved into a list that is already at its WIP limit.':
    'Если включено, карточки нельзя перемещать в список с достигнутым лимитом WIP.',
  'WIP limit': 'Лимит WIP',
  Dependencies: 'Зависимости',
  'No dependencies': 'Нет зависимостей',
  'Remove dependency': 'Убрать зависимость',
  'Add dependency': 'Добавить зависимость',
  'Dependency would create a cycle': 'Зависимость создаст цикл',
  'No cards available': 'Нет доступных карточек',
  'No date': 'Без даты',
  Day: 'День',
  Year: 'Год',
  Edit: 'Редактировать',
  Preview: 'Предпросмотр',
  'No content yet.': 'Пока нет содержимого.',
};

export default lang;
