import backpackImage from '../../images/backpack-1.jpg';
import cameraImage from '../../images/camera-1.jpg';
import headphonesImage1 from '../../images/headphones-1.jpg';
import headphonesImage2 from '../../images/headphones-2.jpg';
import keyboardImage from '../../images/keyboard-1.jpg';
import lampImage1 from '../../images/lamp-1.jpg';
import lampImage2 from '../../images/lamp-2.jpg';
import laptopImage1 from '../../images/laptop-1.jpg';
import laptopImage2 from '../../images/laptop-2.jpg';
import smartphoneImage1 from '../../images/smartphone-1.jpg';
import smartphoneImage2 from '../../images/smartphone-2.jpg';
import smartwatchImage from '../../images/smartwatch-1.jpg';
import speakerImage from '../../images/speaker-1.jpg';

/** @type {Array<Object>} Catalog test data. */
export const products = [
  { id: 1, title: 'Смартфон Iphone 11', price: '49 990 ₽', rating: '4.8', reviewsCount: 128, images: [smartphoneImage1, smartphoneImage2] },
  { id: 2, title: 'Беспроводные наушники', price: '12 490 ₽', rating: '4.7', reviewsCount: 86, images: [headphonesImage1, headphonesImage2] },
  { id: 3, title: 'Умные часы', price: '18 990 ₽', rating: '4.9', reviewsCount: 214, images: [smartwatchImage] },
  { id: 4, title: 'Ноутбук Airbook', price: '89 990 ₽', rating: '4.8', reviewsCount: 73, images: [laptopImage1, laptopImage2] },
  { id: 5, title: 'Камера ', price: '9 990 ₽', rating: '4.6', reviewsCount: 51, images: [cameraImage] },
  { id: 6, title: 'Портативная колонка', price: '7 490 ₽', rating: '4.7', reviewsCount: 98, images: [speakerImage] },
  { id: 7, title: 'Игровая клавиатура', price: '8 990 ₽', rating: '4.8', reviewsCount: 142, images: [keyboardImage] },
  { id: 8, title: 'Рюкзак ', price: '5 790 ₽', rating: '4.5', reviewsCount: 67, images: [backpackImage] },
  { id: 9, title: 'Настольная лампа', price: '4 290 ₽', rating: '4.9', reviewsCount: 109, images: [lampImage1, lampImage2] },
];
