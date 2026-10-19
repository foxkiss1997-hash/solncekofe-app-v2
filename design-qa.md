# Проверка матового интерфейса Солнцекофе

Результат: **passed** для локального визуального предпросмотра. Дата: 2026-10-18. Сервер отдельно развёрнут; визуальный статус относится к изолированному предпросмотру.

## Источники и сравнение

Выбранный пользователем макет: `design-evidence/selected-menu.png`. Реальная браузерная реализация: `design-evidence/browser-menu-drink.png`. Оба источника объединены в `design-evidence/menu-comparison.png` и просмотрены вместе.

Макет 1536×1024: области меню x268/y145/450×820 и напитка x818/y145/450×820. Реальный Chrome 1363×936: области x282/y52/375×845 и x692/y52/375×844. Области нормализованы по ширине 375 с сохранением пропорций; макет короче и дополнен пустым полем, без растягивания. Внешние рамки телефона не сравнивались с содержимым приложения.

## Итерации

1. Проверены типографика, сетка, интервалы, оттенки ivory/yellow/sage, фотографии и управление. Обнаружен P2: нижняя корзина перекрывала цену последней карточки.
2. Адрес точки перенесён в строку бренда, сокращён верхний отступ. После смены версии ассетов проверен обновлённый DOM: низ последнего товара 674.94, верх корзины 708; перекрытие устранено. Повторный визуальный просмотр итогового снимка выполнен.

## Соответствие и осознанные отличия

Сохранены матовое стекло, светлая палитра, сетка 2 колонки, большие изображения, жёлтые действия и нижняя навигация. Системный шрифт и продуктовые фотографии отличаются от концепта. Категория названа «Популярное», потому что включает холодные напитки. Нативные списки молока и сиропов показывают полный действующий ассортимент вместо двух декоративных вариантов макета. Добавлены рабочие избранное и поиск. Собственные фото позиции приоритетны.

## Проверка в браузере

- Chrome: контейнеры 390×845 и 320×844; внутренняя ширина 375 и 305 из-за полосы прокрутки. Горизонтальное переполнение и сломанные изображения не обнаружены.
- Поиск латте по всем категориям, фокус ввода; добавление/фильтр избранного.
- Капучино 300 ₽ + кокосовое молоко 80 ₽ + карамель 50 ₽ = 430 ₽; правильный состав в корзине.
- Нижняя навигация, выбор точки и корзина доступны. Все данные синтетические; записи и платежи заблокированы.
- Ошибок источника приложения не наблюдалось; расширение браузера пишет постороннюю ошибку отправки метаданных.
- 45 автоматических теста и DOM smoke проходят: сохранение ввода, фокуса, курсора и прокрутки, серверные конфликты, идемпотентность и права.

Открытых P0/P1/P2 в проверенных экранах нет. Возможны P3 отличия фотографии, размеров букв и промежутков от нарисованного концепта. Не проверены физический телефон, Telegram-камера, клавиатура, реальные платежи и серверные уведомления. Перед запуском нужны серверная установка и проверка правил доступа, описанные в release notes.

## Личный календарь — 18 октября

Добавлен календарь сотрудника за месяц: утверждённая работа, заявка и отсутствие назначенной смены различаются цветом и текстом выбранного дня. Видны часы, точка и ближайшая будущая смена. Личные смены читаются с обеих точек и отделены от общего состава команды. Запрос и замена не считаются утверждённой работой.

46 тестов и DOM smoke прошли. Проверены переход декабрь → январь, 31 день месяца, рабочий день, заявка, день без смены, подпись другой точки, отсутствие клиентской записи и серверная авторизация. Chrome: 390/320 px, внутри узкого iframe ширина и scrollWidth равны 305. Найдено и исправлено переполнение поля времени. Снимок: design-evidence/personal-calendar.jpg (синтетические данные).

## Выбор нескольких смен — исправление модели

Предыдущая модель напарников отменена после уточнения пользователя: на одной точке в пересекающееся время работает один сотрудник. Список команды показывает последовательные смены, без блока совместной работы.

Сотрудник выбирает несколько свободных или занятых смен и отправляет один пакет. Свободные смены утверждает администратор. Занятая смена остаётся за текущим сотрудником до согласия этого сотрудника либо администратора. Исходящий запрос замены может подтвердить адресат либо администратор. Заявку можно отклонить/отменить. Пакет сохраняется атомарно с проверкой версий; повтор не создаёт дубликатов, в том числе после дальнейшего согласования. Пересечения на одной точке и одновременная работа одного человека на двух точках блокируются сервером.

53 теста и DOM smoke прошли. Chrome: выбор двух смен на 390/320 px, перенос текста, отсутствие горизонтального переполнения: 375/375 и 305/305. Снимок design-evidence/shift-selection.jpg содержит только демоданные. Реальные смены не создавались. Проверка физического Telegram-устройства и миграция старых правил Firebase не входят в эту проверку.

## Восемь смен одной отправкой — 19 октября

Добавлен режим «Выбрать несколько дней»: сотрудник отмечает 7–8 дат в календаре, добавляет их в общий выбор и отправляет весь список одной кнопкой. При одной готовой смене на дату используются её часы; неоднозначный выбор нескольких готовых смен требует выбрать конкретный слот в расписании. Новые даты используют общее время из формы. Выбор сохраняется на текущем устройстве по сотруднику и точке, допускает редактирование дат/часов и удаление до отправки. Собственную неутверждённую заявку на новый день можно редактировать с серверной проверкой ревизии и пересечений. Утверждённые назначения и готовые слоты не меняются сотрудником напрямую.

56 тестов и DOM smoke прошли: ровно один запрос на восемь смен, одна атомарная запись на сервере, повтор без дублей, изоляция сохранённого выбора, редактирование и восстановление после перезагрузки, запрет чужого/устаревшего/утверждённого изменения. Chrome: восемь выбранных дней и кнопка «Отправить на согласование (8)»; отсутствие переполнения 375/375 и 305/305. Снимок design-evidence/eight-shifts.jpg — демоданные. Физический Telegram не проверялся. Вход Google восстановлен перед публикацией.

## Подтверждение графика в админке — 19 октября

Вкладка «График / заявки» содержит блок «Подтверждение графика» по выбранной кофейне. Заявки сгруппированы по исходной отправке и сотруднику, включая прежние записи с историей batch. Кнопки «Подтвердить все (8)» и «Отклонить все (8)» открывают явное подтверждение решения. Индивидуальные действия сохранены в расписании. При отказе от готовой свободной смены она снова открыта, при отказе от передачи назначенный сотрудник остаётся прежним.

60 тестов и DOM smoke прошли: авторизация администратора, одна запись на восемь утверждений, повтор без дублей, полное отклонение при конфликте или старой версии одного элемента, смешанный список новых смен и замен, изоляция тестового корня. Chrome 390/320 px: восемь дат, обе кнопки решения, дополнительное подтверждение; ширина и scrollWidth равны 375/375 и 305/305. Снимок design-evidence/admin-approvals.jpg — синтетические данные. Реальные смены не изменялись.

## Недельная зарплата — 19 октября

Ставка 4 200 ₽ за подтверждённую отработанную смену. Период понедельник—воскресенье, день выплаты — воскресенье. Сотрудник видит свои начисления по обеим кофейням и может переключать недели. Администратор видит итоги по людям и закончившиеся утверждённые смены для подтверждения. Будущие смены, заявки и просто назначения не увеличивают начисления. Выплата денег проводится администратором; приложение считает начисления.

Начисления хранятся в отдельной закрытой Google-таблице, создаваемой только при первом реальном подтверждении работы. В публичную ветку графика суммы и зарплатная история не записываются. Журнал неизменяемый по строкам: подтверждение +4 200, отмена −4 200 с причиной. Повтор проверяется по ID и содержанию; потеря ответа после записи не создаёт второе начисление. Пока начисление активно, изменение назначенной смены через API заблокировано. Тестовые записи используют отдельную таблицу. Чтение зарплаты не создаёт ни таблиц, ни начислений.

71 тест и DOM smoke прошли: пять смен = 21 000; воскресенье и границы месяца/года, две точки, чужой сотрудник, будущая/устаревшая смена, ожидающая замена, отмена с причиной, повтор после потери ответа, закрытая таблица, изоляция теста. Chrome 390/320 px: сумма, недельный период, воскресенье, подтверждение работы; ширина/scrollWidth 375/375 и 305/305. Снимок design-evidence/weekly-payroll.jpg содержит только демоданные. Реальных начислений, выплат и новых рабочих зарплатных таблиц при проверке не создавалось.

## 19 October — camera attendance and penalties

- Server timestamp on begin; five-minute camera session; no completion without JPEG photo stored in private Drive folder. No gallery/file input in opening UI. Browser media stream cannot prove photo authenticity; Telegram iOS/Android physical camera verification remains outstanding.
- Exact thresholds: <5 min zero, >=5 min 200 RUB, >=15 min 1000 RUB. Network upload time excluded after begin. Offline arrival requires administrator correction.
- Private append-only payroll journal also stores attendance, manual fines and reasoned reversals. Firebase receives no attendance/photo/fine writes. Retries do not duplicate opening or deductions. Schedule changes blocked after opening.
- Employee sees own records across both shops. Administrator sees photo link (Drive owner access), adds penalties to approved shifts, reverses penalties with reason; weekly amount = gross - active penalties, potentially negative before earned shifts are confirmed. No money transfers.
- 77 unit tests and DOM smoke passed. Narrow screens 390/320 px had no horizontal overflow. Synthetic preview only; no real check-in, employee fine or payment created.
- Backend deployment version 17. Frontend cache attendance1.

## 19 October — visible opening action and scoped guest ID form

- Opening entry moved to top of staff dashboard. The opening form keeps an action even when schedule is empty; action reloads authoritative schedule and starts camera only for one approved assignment. Multiple assignments retain individual camera buttons. Empty state names employee, point and server date, explains approval requirement and links to schedule. Loading and request failure now have separate messages; no fine without approved start time.
- Guest ID and QR scanner moved into dedicated Stamp form. Manual stamp form is absent from opening, payroll, schedule, delivery, expenses and rewards. Gift/bonus ID lookup remains in its own form.
- DOM smoke passed, including empty/loading/error opening states, manual ID presence only in stamp mode and existing mobile input/scroll stability. No live shifts, payroll or guest rewards changed.

## 19 October — administrator assignment calendar and point hours

- Administrator selects point and active employee, toggles up to 31 dates across months and reviews/assigns them in one atomic request. New assignments are approved immediately; employee calendar reads the same schedule and refreshes every 15 seconds while visible, or on manual refresh. No second employee approval.
- Server-derived hours: Nagatinskaya weekdays 08:00–21:00, Sat/Sun 10:00–22:00; Ryazansky weekdays 08:00–20:00, Sat/Sun 09:00–21:00. New staff calendar dates use the same point/day rules; manual editing of a single existing shift remains available.
- Other employee assignments and cross-point overlap block the entire batch. Stale revisions, duplicate days, inactive employee, past dates, payroll/attendance locks and retries covered. Selection is isolated by point/employee and reset when either changes.
- 85 unit tests and DOM smoke passed. One eight-day assignment request tested with mixed weekdays/weekends; immediate staff calendar and check-in visibility verified in isolated server tests. No real employee schedule or payroll changed by QA. Physical browser at 390 and 320 px had no horizontal overflow.
- Backend v19, frontend admincal2. Read-only readiness passed with productionWrites=0; the checker now unwraps Google responses without corrupting JSON batch fingerprints. Private attendance/payroll, QR loyalty and existing schedule approvals preserved.
