-- phpMyAdmin SQL Dump
-- version 4.2.7.1
-- http://www.phpmyadmin.net
--
-- Host: 127.0.0.1
-- Generation Time: May 31, 2015 at 06:58 AM
-- Server version: 5.5.39
-- PHP Version: 5.4.31

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8 */;

--
-- Database: `apotek`
--

-- --------------------------------------------------------

--
-- Table structure for table `t1_flag`
--

CREATE TABLE IF NOT EXISTS `t1_flag` (
`FLAG_PK__` int(11) NOT NULL,
  `FLAG_NAMA__` varchar(100) NOT NULL
) ENGINE=InnoDB  DEFAULT CHARSET=utf8 AUTO_INCREMENT=3 ;

--
-- Dumping data for table `t1_flag`
--

INSERT INTO `t1_flag` (`FLAG_PK__`, `FLAG_NAMA__`) VALUES
(2, 'Commit'),
(1, 'Pending');

-- --------------------------------------------------------

--
-- Table structure for table `t1_kategori`
--

CREATE TABLE IF NOT EXISTS `t1_kategori` (
`KATEGORI_PK__` int(11) NOT NULL,
  `KATEGORI_NAMA__` varchar(255) NOT NULL,
  `KATEGORI_BUAT_OLEH__` varchar(255) NOT NULL,
  `KATEGORI_TGL_BUAT__` date NOT NULL,
  `KATEGORI_UPD_OLEH__` varchar(255) DEFAULT NULL,
  `KATEGORI_TGL_UPD__` date DEFAULT NULL
) ENGINE=InnoDB  DEFAULT CHARSET=utf8 AUTO_INCREMENT=9 ;

--
-- Dumping data for table `t1_kategori`
--

INSERT INTO `t1_kategori` (`KATEGORI_PK__`, `KATEGORI_NAMA__`, `KATEGORI_BUAT_OLEH__`, `KATEGORI_TGL_BUAT__`, `KATEGORI_UPD_OLEH__`, `KATEGORI_TGL_UPD__`) VALUES
(1, 'Obat Keras', 'admin', '2015-03-16', 'admin', '2015-03-17'),
(4, 'Obat Bebas', 'admin', '2015-03-16', 'admin', '2015-03-17'),
(5, 'Obat Bebas Terbatas', 'admin', '2015-03-17', NULL, NULL),
(6, 'Psikotropika dan Narkotika', 'admin', '2015-03-17', NULL, NULL),
(7, 'Minuman', 'admin', '2015-03-17', NULL, NULL),
(8, 'Kosmetik', 'admin', '2015-03-17', 'admin', '2015-05-10');

-- --------------------------------------------------------

--
-- Table structure for table `t1_penyesuaian_status`
--

CREATE TABLE IF NOT EXISTS `t1_penyesuaian_status` (
`PENY_ST_PK__` int(11) NOT NULL,
  `PENY_ST_NAMA__` varchar(255) NOT NULL,
  `PENY_ST_BUAT_OLEH__` varchar(255) NOT NULL,
  `PENY_ST_TGL_BUAT__` date NOT NULL,
  `PENY_ST_UPD_OLEH__` varchar(255) DEFAULT NULL,
  `PENY_ST_TGL_UPD__` date DEFAULT NULL
) ENGINE=InnoDB  DEFAULT CHARSET=utf8 AUTO_INCREMENT=6 ;

--
-- Dumping data for table `t1_penyesuaian_status`
--

INSERT INTO `t1_penyesuaian_status` (`PENY_ST_PK__`, `PENY_ST_NAMA__`, `PENY_ST_BUAT_OLEH__`, `PENY_ST_TGL_BUAT__`, `PENY_ST_UPD_OLEH__`, `PENY_ST_TGL_UPD__`) VALUES
(1, 'Barang Hilang', 'admin', '2015-03-16', 'admin', '2015-03-17'),
(4, 'Barang Ditemukan', 'admin', '2015-03-16', 'admin', '2015-03-17'),
(5, 'Pemakaian Pribadi', 'admin', '2015-03-17', NULL, NULL);

-- --------------------------------------------------------

--
-- Table structure for table `t1_role`
--

CREATE TABLE IF NOT EXISTS `t1_role` (
`ROLE_PK__` int(11) NOT NULL,
  `ROLE_NAMA__` varchar(255) NOT NULL,
  `ROLE_BUAT_OLEH__` varchar(255) NOT NULL,
  `ROLE_TGL_BUAT__` date NOT NULL,
  `ROLE_UPD_OLEH__` varchar(255) DEFAULT NULL,
  `ROLE_TGL_UPD__` date DEFAULT NULL
) ENGINE=InnoDB  DEFAULT CHARSET=utf8 AUTO_INCREMENT=2 ;

--
-- Dumping data for table `t1_role`
--

INSERT INTO `t1_role` (`ROLE_PK__`, `ROLE_NAMA__`, `ROLE_BUAT_OLEH__`, `ROLE_TGL_BUAT__`, `ROLE_UPD_OLEH__`, `ROLE_TGL_UPD__`) VALUES
(1, 'Administrator', 'admin', '2015-03-14', NULL, NULL);

-- --------------------------------------------------------

--
-- Table structure for table `t1_satuan`
--

CREATE TABLE IF NOT EXISTS `t1_satuan` (
`SATUAN_PK__` int(11) NOT NULL,
  `SATUAN_NAMA__` varchar(255) NOT NULL,
  `SATUAN_BUAT_OLEH__` varchar(255) NOT NULL,
  `SATUAN_TGL_BUAT__` date NOT NULL,
  `SATUAN_UPD_OLEH__` varchar(255) DEFAULT NULL,
  `SATUAN_TGL_UPD__` date DEFAULT NULL
) ENGINE=InnoDB  DEFAULT CHARSET=utf8 AUTO_INCREMENT=5 ;

--
-- Dumping data for table `t1_satuan`
--

INSERT INTO `t1_satuan` (`SATUAN_PK__`, `SATUAN_NAMA__`, `SATUAN_BUAT_OLEH__`, `SATUAN_TGL_BUAT__`, `SATUAN_UPD_OLEH__`, `SATUAN_TGL_UPD__`) VALUES
(1, 'Box', 'admin', '2015-03-16', 'admin', '2015-03-17'),
(2, 'Tablet', 'admin', '2015-03-16', 'admin', '2015-03-17'),
(3, 'Strip', 'admin', '2015-03-16', 'admin', '2015-03-17'),
(4, 'Botol', 'admin', '2015-03-17', NULL, NULL);

-- --------------------------------------------------------

--
-- Table structure for table `t1_status`
--

CREATE TABLE IF NOT EXISTS `t1_status` (
`STATUS_PK__` int(11) NOT NULL,
  `STATUS_NAMA__` varchar(255) NOT NULL,
  `STATUS_BUAT_OLEH__` varchar(255) NOT NULL,
  `STATUS_TGL_BUAT__` date NOT NULL,
  `STATUS_UPD_OLEH__` varchar(255) DEFAULT NULL,
  `STATUS_TGL_UPD__` date DEFAULT NULL
) ENGINE=InnoDB  DEFAULT CHARSET=utf8 AUTO_INCREMENT=4 ;

--
-- Dumping data for table `t1_status`
--

INSERT INTO `t1_status` (`STATUS_PK__`, `STATUS_NAMA__`, `STATUS_BUAT_OLEH__`, `STATUS_TGL_BUAT__`, `STATUS_UPD_OLEH__`, `STATUS_TGL_UPD__`) VALUES
(1, 'Discontinued', 'admin', '2015-03-16', 'admin', '2015-03-17'),
(2, 'Konsinyasi', 'admin', '2015-03-16', 'admin', '2015-03-17'),
(3, 'Ready-Stock', 'admin', '2015-03-16', 'admin', '2015-03-17');

-- --------------------------------------------------------

--
-- Table structure for table `t1_supplier`
--

CREATE TABLE IF NOT EXISTS `t1_supplier` (
`SUPPLIER_PK__` int(11) NOT NULL,
  `SUPPLIER_NAMA__` varchar(255) NOT NULL,
  `SUPPLIER_NO_TELP__` varchar(255) NOT NULL,
  `SUPPLIER_ALAMAT__` text NOT NULL,
  `SUPPLIER_BUAT_OLEH__` varchar(255) NOT NULL,
  `SUPPLIER_TGL_BUAT__` date NOT NULL,
  `SUPPLIER_UPD_OLEH__` varchar(255) DEFAULT NULL,
  `SUPPLIER_TGL_UPD__` date DEFAULT NULL
) ENGINE=InnoDB  DEFAULT CHARSET=utf8 AUTO_INCREMENT=6 ;

--
-- Dumping data for table `t1_supplier`
--

INSERT INTO `t1_supplier` (`SUPPLIER_PK__`, `SUPPLIER_NAMA__`, `SUPPLIER_NO_TELP__`, `SUPPLIER_ALAMAT__`, `SUPPLIER_BUAT_OLEH__`, `SUPPLIER_TGL_BUAT__`, `SUPPLIER_UPD_OLEH__`, `SUPPLIER_TGL_UPD__`) VALUES
(1, 'PT. Sehat Selalu', '081000111222', 'Jl. Dipati Ukur, No, 29<br>Jakarta Selatan, Indonesia', 'admin', '2015-03-16', NULL, NULL),
(4, 'PT. Makmur Sejahtera', '082111222333', 'Jl. Fly Over Semanggi, Jakarta', 'admin', '2015-03-16', 'admin', '2015-03-16'),
(5, 'PT. Menang Tender', '083444222555', 'Jl. Kaki, Desa Sukajadi, Grobogan, Jawa Timur', 'admin', '2015-03-16', NULL, NULL);

-- --------------------------------------------------------

--
-- Table structure for table `t2_barang`
--

CREATE TABLE IF NOT EXISTS `t2_barang` (
`BARANG_PK__` int(11) NOT NULL,
  `SATUAN_PK__` int(11) NOT NULL,
  `STATUS_PK__` int(11) NOT NULL,
  `KATEGORI_PK__` int(11) NOT NULL,
  `BARANG_KODE__` varchar(255) NOT NULL,
  `BARANG_NAMA__` varchar(255) NOT NULL,
  `BARANG_JUMLAH_KECIL__` int(11) DEFAULT NULL,
  `BARANG_JUMLAH_STOCK__` int(11) NOT NULL,
  `BARANG_NILAI_ASLI__` decimal(15,2) NOT NULL,
  `BARANG_HARGA_BELI__` decimal(15,2) NOT NULL,
  `BARANG_MARGIN__` decimal(5,2) NOT NULL,
  `BARANG_HARGA_JUAL_REKOMENDASI__` decimal(15,2) NOT NULL,
  `BARANG_HARGA_JUAL_SEBENARNYA__` decimal(15,2) NOT NULL,
  `BARANG_BUAT_OLEH__` varchar(255) NOT NULL,
  `BARANG_TGL_BUAT__` date NOT NULL,
  `BARANG_UPD_OLEH__` varchar(255) DEFAULT NULL,
  `BARANG_TGL_UPD__` date DEFAULT NULL
) ENGINE=InnoDB  DEFAULT CHARSET=utf8 AUTO_INCREMENT=9 ;

--
-- Dumping data for table `t2_barang`
--

INSERT INTO `t2_barang` (`BARANG_PK__`, `SATUAN_PK__`, `STATUS_PK__`, `KATEGORI_PK__`, `BARANG_KODE__`, `BARANG_NAMA__`, `BARANG_JUMLAH_KECIL__`, `BARANG_JUMLAH_STOCK__`, `BARANG_NILAI_ASLI__`, `BARANG_HARGA_BELI__`, `BARANG_MARGIN__`, `BARANG_HARGA_JUAL_REKOMENDASI__`, `BARANG_HARGA_JUAL_SEBENARNYA__`, `BARANG_BUAT_OLEH__`, `BARANG_TGL_BUAT__`, `BARANG_UPD_OLEH__`, `BARANG_TGL_UPD__`) VALUES
(4, 4, 1, 8, 'B123', 'Ganja Kualitas Super', 250, 555, '100000.00', '110000.00', '10.00', '121000.00', '125000.00', 'admin', '2015-03-20', 'admin', '2015-05-08'),
(5, 4, 1, 8, 'A123', 'Betadine', 250, 690, '11000.00', '12100.00', '10.00', '13310.00', '12500.00', 'admin', '2015-03-20', 'admin', '2015-05-30'),
(6, 4, 1, 8, 'C123', 'Sarung Gajah Duduk', 250, 520, '25000.00', '27500.00', '10.00', '30250.00', '32000.00', 'admin', '2015-03-20', 'admin', '2015-04-28'),
(7, 3, 3, 6, 'D123', 'Dodol', 250, 350, '3000.00', '3300.00', '10.00', '3630.00', '4000.00', 'admin', '2015-03-21', 'admin', '2015-05-31'),
(8, 4, 3, 4, 'E123', 'Salep Cap Cai', 250, 420, '5000.00', '5500.00', '12.00', '6160.00', '6500.00', 'admin', '2015-04-13', 'admin', '2015-05-31');

-- --------------------------------------------------------

--
-- Table structure for table `t2_costumer`
--

CREATE TABLE IF NOT EXISTS `t2_costumer` (
`CST_PK__` int(11) NOT NULL,
  `CST_NAMA__` varchar(255) NOT NULL,
  `CST_NO_TELP__` varchar(255) DEFAULT NULL,
  `CST_ALAMAT__` text,
  `CST_BUAT_OLEH__` varchar(255) NOT NULL,
  `CST_TGL_BUAT__` date NOT NULL,
  `CST_UPD_OLEH__` varchar(255) DEFAULT NULL,
  `CST_TGL_UPD__` date DEFAULT NULL
) ENGINE=InnoDB  DEFAULT CHARSET=utf8 AUTO_INCREMENT=3 ;

--
-- Dumping data for table `t2_costumer`
--

INSERT INTO `t2_costumer` (`CST_PK__`, `CST_NAMA__`, `CST_NO_TELP__`, `CST_ALAMAT__`, `CST_BUAT_OLEH__`, `CST_TGL_BUAT__`, `CST_UPD_OLEH__`, `CST_TGL_UPD__`) VALUES
(1, 'Fulan bin Fulani', '081222333444', 'Jl. Jend. Ahmad Yani, no.01 Jaksel', 'admin', '2015-03-22', 'admin', '2015-03-22'),
(2, 'Jaka Sembung', '088999111222', 'Jl. Diponegoro, no.02 Jakpus', 'admin', '2015-03-22', 'admin', '2015-03-22');

-- --------------------------------------------------------

--
-- Table structure for table `t2_karyawan`
--

CREATE TABLE IF NOT EXISTS `t2_karyawan` (
`KARYAWAN_PK__` int(11) NOT NULL,
  `ROLE_PK__` int(11) NOT NULL,
  `KARYAWAN_NAMA__` varchar(255) NOT NULL,
  `KARYAWAN_NO_TELP__` varchar(255) DEFAULT NULL,
  `KARYAWAN_ALAMAT__` text,
  `KARYAWAN_JABATAN__` varchar(255) DEFAULT NULL,
  `KARYAWAN_USERNAME__` varchar(255) NOT NULL,
  `KARYAWAN_PASSWORD__` varchar(255) NOT NULL,
  `KARYAWAN_PASSWORD_SALT__` varchar(255) NOT NULL,
  `KARYAWAN_LAST_LOGIN__` datetime DEFAULT NULL,
  `KARYAWAN_BUAT_OLEH__` varchar(255) NOT NULL,
  `KARYAWAN_TGL_BUAT__` date NOT NULL,
  `KARYAWAN_UPD_OLEH__` varchar(255) DEFAULT NULL,
  `KARYAWAN_TGL_UPD__` date DEFAULT NULL
) ENGINE=InnoDB  DEFAULT CHARSET=utf8 AUTO_INCREMENT=3 ;

--
-- Dumping data for table `t2_karyawan`
--


-- --------------------------------------------------------

--
-- Table structure for table `t3_hutang`
--

CREATE TABLE IF NOT EXISTS `t3_hutang` (
`HUTANG_PK__` int(11) NOT NULL,
  `SUPPLIER_PK__` int(11) NOT NULL,
  `HUTANG_JUMLAH__` decimal(15,2) NOT NULL,
  `HUTANG_DIBAYAR__` decimal(15,2) DEFAULT NULL,
  `HUTANG_KET__` text,
  `HUTANG_BUAT_OLEH__` varchar(255) NOT NULL,
  `HUTANG_TGL_BUAT__` date NOT NULL,
  `HUTANG_UPD_OLEH__` varchar(255) DEFAULT NULL,
  `HUTANG_TGL_UPD__` date DEFAULT NULL
) ENGINE=InnoDB  DEFAULT CHARSET=utf8 AUTO_INCREMENT=3 ;

--
-- Dumping data for table `t3_hutang`
--

INSERT INTO `t3_hutang` (`HUTANG_PK__`, `SUPPLIER_PK__`, `HUTANG_JUMLAH__`, `HUTANG_DIBAYAR__`, `HUTANG_KET__`, `HUTANG_BUAT_OLEH__`, `HUTANG_TGL_BUAT__`, `HUTANG_UPD_OLEH__`, `HUTANG_TGL_UPD__`) VALUES
(1, 4, '400000.00', '300000.00', 'Di sini diisi apa yah?', 'admin', '2015-04-11', 'admin', '2015-04-11'),
(2, 5, '500000.00', '475000.00', 'Ngutang maning son.', 'admin', '2015-04-11', 'admin', '2015-04-11');

-- --------------------------------------------------------

--
-- Table structure for table `t3_penjualan`
--

CREATE TABLE IF NOT EXISTS `t3_penjualan` (
`PENJUALAN_PK__` int(11) NOT NULL,
  `FLAG_PK__` int(11) NOT NULL,
  `PENJUALAN_NO_STRUK__` varchar(255) NOT NULL,
  `PENJUALAN_CST_NM__` varchar(255) DEFAULT NULL,
  `PENJUALAN_BAYAR__` decimal(15,2) NOT NULL,
  `PENJUALAN_GRAND_TOTAL__` decimal(15,2) NOT NULL,
  `PENJUALAN_KET__` text,
  `PENJUALAN_BUAT_OLEH__` varchar(255) NOT NULL,
  `PENJUALAN_TGL_BUAT__` date NOT NULL,
  `PENJUALAN_UPD_OLEH__` varchar(255) DEFAULT NULL,
  `PENJUALAN_TGL_UPD__` date DEFAULT NULL
) ENGINE=InnoDB  DEFAULT CHARSET=utf8 AUTO_INCREMENT=12 ;

--
-- Dumping data for table `t3_penjualan`
--

INSERT INTO `t3_penjualan` (`PENJUALAN_PK__`, `FLAG_PK__`, `PENJUALAN_NO_STRUK__`, `PENJUALAN_CST_NM__`, `PENJUALAN_BAYAR__`, `PENJUALAN_GRAND_TOTAL__`, `PENJUALAN_KET__`, `PENJUALAN_BUAT_OLEH__`, `PENJUALAN_TGL_BUAT__`, `PENJUALAN_UPD_OLEH__`, `PENJUALAN_TGL_UPD__`) VALUES
(3, 1, '07042015001', 'Joko Santoso', '2000000.00', '1375000.00', 'Lunas', 'admin', '2015-04-07', 'admin', '2015-05-02'),
(4, 2, '08042015001', 'Dadi Wahidi', '2000000.00', '1415000.00', 'Barang dibayar lunas, barang segera dikirim.', 'admin', '2015-04-08', 'admin', '2015-04-13'),
(5, 2, '13042015001', 'Andi Law', '550000.00', '510000.00', 'Wah, ada andi law beli salep.', 'admin', '2015-04-13', 'admin', '2015-04-13'),
(6, 1, '14042015001', 'Aji Saka', '200000.00', '357500.00', 'Pembayaran Belum Lunas.', 'admin', '2015-04-14', 'admin', '2015-05-05'),
(7, 2, '30052015001', '', '125000.00', '125000.00', '', 'admin', '2015-05-30', 'admin', '2015-05-30'),
(8, 1, '30052015002', 'John Pantau', '950000.00', '930000.00', 'Wah ada artis rada2&nbsp;beli di apotek ane nih, hehe.', 'admin', '2015-05-30', 'admin', '2015-05-31'),
(9, 2, '31052015001', 'Bambang Berambang', '600000.00', '330000.00', 'Namanya unik bang.&nbsp;Ini adalah percobaan update transaksi dg preview dan statusnya sudah commit.', 'admin', '2015-05-31', 'admin', '2015-05-31'),
(11, 1, '31052015002', 'PMK SMPN 1 Swasta', '200000.00', '190000.00', 'Belum kelar diurus, soalnya petugasnya lagi ke WC bentar.', 'admin', '2015-05-31', 'admin', '2015-05-31');

-- --------------------------------------------------------

--
-- Table structure for table `t3_penjualan_item`
--

CREATE TABLE IF NOT EXISTS `t3_penjualan_item` (
  `PENJUALAN_PK__` int(11) NOT NULL,
  `BARANG_PK__` int(11) NOT NULL,
`ITM_JUAL_PK` int(11) NOT NULL,
  `ITM_JUAL_HARGA__` decimal(15,2) DEFAULT NULL,
  `ITM_JUAL_JUMLAH__` int(11) NOT NULL,
  `ITM_JUAL_DISC__` decimal(5,2) DEFAULT NULL,
  `ITM_JUAL_TOTAL__` decimal(15,2) DEFAULT NULL,
  `ITM_JUAL_BUAT_OLEH__` varchar(255) NOT NULL,
  `ITM_JUAL_TGL_BUAT__` date NOT NULL,
  `ITM_JUAL_UPD_OLEH__` varchar(255) DEFAULT NULL,
  `ITM_JUAL_TGL_UPD__` date DEFAULT NULL
) ENGINE=InnoDB  DEFAULT CHARSET=utf8 AUTO_INCREMENT=33 ;

--
-- Dumping data for table `t3_penjualan_item`
--

INSERT INTO `t3_penjualan_item` (`PENJUALAN_PK__`, `BARANG_PK__`, `ITM_JUAL_PK`, `ITM_JUAL_HARGA__`, `ITM_JUAL_JUMLAH__`, `ITM_JUAL_DISC__`, `ITM_JUAL_TOTAL__`, `ITM_JUAL_BUAT_OLEH__`, `ITM_JUAL_TGL_BUAT__`, `ITM_JUAL_UPD_OLEH__`, `ITM_JUAL_TGL_UPD__`) VALUES
(3, 5, 1, '12500.00', 10, '0.00', '125000.00', 'admin', '2015-04-07', 'admin', '2015-04-11'),
(3, 4, 2, '125000.00', 10, '0.00', '1250000.00', 'admin', '2015-04-07', 'admin', '2015-04-11'),
(4, 5, 3, '12500.00', 10, '0.00', '125000.00', 'admin', '2015-04-08', 'admin', '2015-04-13'),
(4, 4, 4, '125000.00', 10, '0.00', '1250000.00', 'admin', '2015-04-08', 'admin', '2015-04-13'),
(4, 7, 12, '4000.00', 10, '0.00', '40000.00', 'admin', '2015-04-13', 'admin', '2015-04-13'),
(5, 8, 13, '6500.00', 10, '0.00', '65000.00', 'admin', '2015-04-13', NULL, NULL),
(5, 5, 14, '12500.00', 10, '0.00', '125000.00', 'admin', '2015-04-13', 'admin', '2015-04-13'),
(5, 6, 15, '32000.00', 10, '0.00', '320000.00', 'admin', '2015-04-13', 'admin', '2015-04-13'),
(3, 6, 16, '32000.00', 5, '0.00', '160000.00', 'admin', '2015-04-14', 'admin', '2015-05-02'),
(6, 5, 17, '12500.00', 15, '0.00', '187500.00', 'admin', '2015-04-14', 'admin', '2015-05-02'),
(6, 7, 19, '4000.00', 10, '0.00', '40000.00', 'admin', '2015-04-14', NULL, NULL),
(6, 8, 20, '6500.00', 5, '0.00', '32500.00', 'admin', '2015-04-14', 'admin', '2015-05-05'),
(7, 5, 21, '12500.00', 10, '0.00', '125000.00', 'admin', '2015-05-30', NULL, NULL),
(8, 6, 22, '32000.00', 20, '0.00', '640000.00', 'admin', '2015-05-30', 'admin', '2015-05-30'),
(8, 7, 23, '4000.00', 10, '0.00', '40000.00', 'admin', '2015-05-30', NULL, NULL),
(8, 5, 26, '12500.00', 10, '0.00', '125000.00', 'admin', '2015-05-30', NULL, NULL),
(9, 7, 27, '4000.00', 50, '0.00', '200000.00', 'admin', '2015-05-31', NULL, NULL),
(9, 8, 28, '6500.00', 20, '0.00', '130000.00', 'admin', '2015-05-31', 'admin', '2015-05-31'),
(8, 4, 29, '125000.00', 1, '0.00', '125000.00', 'admin', '2015-05-31', NULL, NULL),
(11, 5, 31, '12500.00', 10, '0.00', '125000.00', 'admin', '2015-05-31', NULL, NULL),
(11, 8, 32, '6500.00', 10, '0.00', '65000.00', 'admin', '2015-05-31', NULL, NULL);

-- --------------------------------------------------------

--
-- Table structure for table `t3_penyesuaian_item`
--

CREATE TABLE IF NOT EXISTS `t3_penyesuaian_item` (
`PENY_ITEM_PK__` int(11) NOT NULL,
  `BARANG_PK__` int(11) NOT NULL,
  `PENY_ST_PK__` int(11) NOT NULL,
  `PENY_ITEM_JML__` int(11) NOT NULL,
  `PENY_ITEM_KET__` text,
  `PENY_BUAT_OLEH__` varchar(255) NOT NULL,
  `PENY_TGL_BUAT__` date NOT NULL,
  `PENY_UPD_OLEH__` varchar(255) DEFAULT NULL,
  `PENY_TGL_UPD__` date DEFAULT NULL
) ENGINE=InnoDB  DEFAULT CHARSET=utf8 AUTO_INCREMENT=20 ;

--
-- Dumping data for table `t3_penyesuaian_item`
--

INSERT INTO `t3_penyesuaian_item` (`PENY_ITEM_PK__`, `BARANG_PK__`, `PENY_ST_PK__`, `PENY_ITEM_JML__`, `PENY_ITEM_KET__`, `PENY_BUAT_OLEH__`, `PENY_TGL_BUAT__`, `PENY_UPD_OLEH__`, `PENY_TGL_UPD__`) VALUES
(2, 7, 1, -50, 'Barang hilang, kemungkinan besar&nbsp;dicuri kucing. Investigasi dari aparat kepolisian masih berlangsung.', 'admin', '2015-04-12', 'admin', '2015-04-15'),
(3, 4, 5, -10, 'Ini siapa yang make? Lapor polisi lah.', 'admin', '2015-04-12', 'admin', '2015-04-15'),
(17, 5, 1, -25, 'dicuri kucing', 'admin', '2015-04-13', 'admin', '2015-04-13'),
(18, 8, 1, -50, 'HIlang kemana?', 'admin', '2015-04-14', 'admin', '2015-04-14'),
(19, 5, 4, 15, 'Ditemukan di pinggir kali', 'admin', '2015-04-15', 'admin', '2015-04-15');

-- --------------------------------------------------------

--
-- Table structure for table `t3_piutang`
--

CREATE TABLE IF NOT EXISTS `t3_piutang` (
`PIUTANG_PK__` int(11) NOT NULL,
  `CST_PK__` int(11) NOT NULL,
  `PIUTANG_JUMLAH__` decimal(15,2) NOT NULL,
  `PIUTANG_DIBAYAR__` decimal(15,2) DEFAULT NULL,
  `PIUTANG_KET__` text,
  `PIUTANG_BUAT_OLEH__` varchar(255) NOT NULL,
  `PIUTANG_TGL_BUAT__` date NOT NULL,
  `PIUTANG_UPD_OLEH__` varchar(255) DEFAULT NULL,
  `PIUTANG_TGL_UPD__` date DEFAULT NULL
) ENGINE=InnoDB  DEFAULT CHARSET=utf8 AUTO_INCREMENT=3 ;

--
-- Dumping data for table `t3_piutang`
--

INSERT INTO `t3_piutang` (`PIUTANG_PK__`, `CST_PK__`, `PIUTANG_JUMLAH__`, `PIUTANG_DIBAYAR__`, `PIUTANG_KET__`, `PIUTANG_BUAT_OLEH__`, `PIUTANG_TGL_BUAT__`, `PIUTANG_UPD_OLEH__`, `PIUTANG_TGL_UPD__`) VALUES
(1, 2, '500000.00', '35000.00', 'Sisa piutangnya masih&nbsp;lumayan banyak bos.', 'admin', '2015-04-11', 'admin', '2015-04-12'),
(2, 1, '250000.00', '75000.00', 'Piutangnya lumayan sedikit.', 'admin', '2015-04-11', NULL, NULL);

-- --------------------------------------------------------

--
-- Table structure for table `t3_purchase_order`
--

CREATE TABLE IF NOT EXISTS `t3_purchase_order` (
`PO_PK__` int(11) NOT NULL,
  `SUPPLIER_PK__` int(11) NOT NULL,
  `PO_NOMOR__` varchar(255) NOT NULL,
  `PO_KET__` text,
  `PO_BUAT_OLEH__` varchar(255) NOT NULL,
  `PO_TGL_BUAT__` date NOT NULL,
  `PO_UPD_OLEH__` varchar(255) DEFAULT NULL,
  `PO_TGL_UPD__` date DEFAULT NULL
) ENGINE=InnoDB  DEFAULT CHARSET=utf8 AUTO_INCREMENT=8 ;

--
-- Dumping data for table `t3_purchase_order`
--

INSERT INTO `t3_purchase_order` (`PO_PK__`, `SUPPLIER_PK__`, `PO_NOMOR__`, `PO_KET__`, `PO_BUAT_OLEH__`, `PO_TGL_BUAT__`, `PO_UPD_OLEH__`, `PO_TGL_UPD__`) VALUES
(2, 1, 'Order1', 'First Order', 'admin', '2015-04-16', 'admin', '2015-04-16'),
(4, 4, 'Order2', 'Second order', 'admin', '2015-04-29', 'admin', '2015-04-29'),
(7, 5, 'Order3', '', 'admin', '2015-04-29', 'admin', '2015-05-30');

-- --------------------------------------------------------

--
-- Table structure for table `t3_purchase_order_item`
--

CREATE TABLE IF NOT EXISTS `t3_purchase_order_item` (
  `PO_PK__` int(11) NOT NULL,
  `BARANG_PK__` int(11) NOT NULL,
`PO_ITM_PK__` int(11) NOT NULL,
  `SATUAN_PK__` int(11) NOT NULL,
  `PO_ITM_JUMLAH__` int(11) NOT NULL,
  `PO_ITM_BUAT_OLEH__` varchar(255) NOT NULL,
  `PO_ITM_TGL_BUAT__` date NOT NULL,
  `PO_ITM_UPD_OLEH__` varchar(255) DEFAULT NULL,
  `PO_ITM_TGL_UPD__` date DEFAULT NULL
) ENGINE=InnoDB  DEFAULT CHARSET=utf8 AUTO_INCREMENT=17 ;

--
-- Dumping data for table `t3_purchase_order_item`
--

INSERT INTO `t3_purchase_order_item` (`PO_PK__`, `BARANG_PK__`, `PO_ITM_PK__`, `SATUAN_PK__`, `PO_ITM_JUMLAH__`, `PO_ITM_BUAT_OLEH__`, `PO_ITM_TGL_BUAT__`, `PO_ITM_UPD_OLEH__`, `PO_ITM_TGL_UPD__`) VALUES
(2, 5, 1, 4, 100, 'admin', '2015-04-16', NULL, NULL),
(2, 4, 2, 1, 10, 'admin', '2015-04-16', 'admin', '2015-04-16'),
(2, 6, 7, 3, 100, 'admin', '2015-04-16', NULL, NULL),
(4, 5, 8, 4, 5, 'admin', '2015-04-29', 'admin', '2015-04-29'),
(4, 4, 9, 1, 10, 'admin', '2015-04-29', NULL, NULL),
(7, 5, 14, 4, 5, 'admin', '2015-04-29', 'admin', '2015-05-30'),
(7, 4, 15, 1, 5, 'admin', '2015-04-29', NULL, NULL),
(7, 8, 16, 2, 5, 'admin', '2015-05-05', NULL, NULL);

-- --------------------------------------------------------

--
-- Table structure for table `t3_purchase_units`
--

CREATE TABLE IF NOT EXISTS `t3_purchase_units` (
`PU_PK__` int(11) NOT NULL,
  `PO_PK__` int(11) NOT NULL,
  `PU_NO_FAKTUR__` varchar(255) NOT NULL,
  `PU_GRAND_TOTAL__` decimal(15,2) NOT NULL,
  `PU_KET__` text,
  `PU_BUAT_OLEH__` varchar(255) NOT NULL,
  `PU_TGL_BUAT__` date NOT NULL,
  `PU_UPD_OLEH__` varchar(255) DEFAULT NULL,
  `PU_TGL_UPD__` date DEFAULT NULL
) ENGINE=InnoDB  DEFAULT CHARSET=utf8 AUTO_INCREMENT=4 ;

--
-- Dumping data for table `t3_purchase_units`
--

INSERT INTO `t3_purchase_units` (`PU_PK__`, `PO_PK__`, `PU_NO_FAKTUR__`, `PU_GRAND_TOTAL__`, `PU_KET__`, `PU_BUAT_OLEH__`, `PU_TGL_BUAT__`, `PU_UPD_OLEH__`, `PU_TGL_UPD__`) VALUES
(3, 4, 'Faktur2', '580000.00', 'Barang sudah sampai semua, PU ini sudah di update.', 'admin', '2015-05-07', 'admin', '2015-05-08');

-- --------------------------------------------------------

--
-- Table structure for table `t3_purchase_units_item`
--

CREATE TABLE IF NOT EXISTS `t3_purchase_units_item` (
  `PU_PK__` int(11) NOT NULL,
  `BARANG_PK__` int(11) NOT NULL,
`PU_ITM_PK__` int(11) NOT NULL,
  `SATUAN_PK__` int(11) NOT NULL,
  `PU_ITM_JUMLAH__` int(11) NOT NULL,
  `PU_ITM_HARGA_BELI__` decimal(15,2) NOT NULL,
  `PU_ITM_DISC__` decimal(5,2) DEFAULT NULL,
  `PU_ITM_TOTAL_BELI__` decimal(15,2) NOT NULL,
  `PU_ITM_BUAT_OLEH__` varchar(255) NOT NULL,
  `PU_ITM_TGL_BUAT__` date NOT NULL,
  `PU_ITM_UPD_OLEH__` varchar(255) DEFAULT NULL,
  `PU_ITM_TGL_UPD__` date DEFAULT NULL
) ENGINE=InnoDB  DEFAULT CHARSET=utf8 AUTO_INCREMENT=3 ;

--
-- Dumping data for table `t3_purchase_units_item`
--

INSERT INTO `t3_purchase_units_item` (`PU_PK__`, `BARANG_PK__`, `PU_ITM_PK__`, `SATUAN_PK__`, `PU_ITM_JUMLAH__`, `PU_ITM_HARGA_BELI__`, `PU_ITM_DISC__`, `PU_ITM_TOTAL_BELI__`, `PU_ITM_BUAT_OLEH__`, `PU_ITM_TGL_BUAT__`, `PU_ITM_UPD_OLEH__`, `PU_ITM_TGL_UPD__`) VALUES
(3, 5, 1, 4, 5, '11000.00', '0.00', '55000.00', 'admin', '2015-05-07', 'admin', '2015-05-08'),
(3, 4, 2, 1, 5, '100000.00', '0.00', '525000.00', 'admin', '2015-05-07', 'admin', '2015-05-08');

-- --------------------------------------------------------

--
-- Table structure for table `t3_retur_penjualan`
--

CREATE TABLE IF NOT EXISTS `t3_retur_penjualan` (
`RETUR_JUAL_PK__` int(11) NOT NULL,
  `ITM_JUAL_PK` int(11) NOT NULL,
  `RETUR_JUAL_JUMLAH__` int(11) NOT NULL,
  `RETUR_JUAL_KET__` text,
  `RETUR_JUAL_BUAT_OLEH__` varchar(255) NOT NULL,
  `RETUR_JUAL_TGL_BUAT__` date NOT NULL,
  `RETUR_JUAL_UPD_OLEH__` varchar(255) DEFAULT NULL,
  `RETUR_JUAL_TGL_UPD__` date DEFAULT NULL
) ENGINE=InnoDB  DEFAULT CHARSET=utf8 AUTO_INCREMENT=8 ;

--
-- Dumping data for table `t3_retur_penjualan`
--

INSERT INTO `t3_retur_penjualan` (`RETUR_JUAL_PK__`, `ITM_JUAL_PK`, `RETUR_JUAL_JUMLAH__`, `RETUR_JUAL_KET__`, `RETUR_JUAL_BUAT_OLEH__`, `RETUR_JUAL_TGL_BUAT__`, `RETUR_JUAL_UPD_OLEH__`, `RETUR_JUAL_TGL_UPD__`) VALUES
(1, 3, 5, 'Segel rusak', 'admin', '2015-04-15', NULL, NULL),
(2, 4, 5, 'Kurang mantap', 'admin', '2015-04-15', NULL, NULL),
(3, 13, 5, 'Kemasan penyok', 'admin', '2015-04-15', NULL, NULL),
(4, 15, 10, 'Sobek', 'admin', '2015-04-15', 'admin', '2015-04-28'),
(6, 14, 5, 'segel rusak', 'admin', '2015-04-28', 'admin', '2015-04-28'),
(7, 14, 5, 'bau busuk', 'admin', '2015-04-29', 'admin', '2015-04-29');

-- --------------------------------------------------------

--
-- Table structure for table `t3_retur_purchase`
--

CREATE TABLE IF NOT EXISTS `t3_retur_purchase` (
`RETUR_PURCHASE_PK__` int(11) NOT NULL,
  `PU_ITM_PK__` int(11) NOT NULL,
  `RETUR_PURCHASE_JUMLAH__` int(11) NOT NULL,
  `RETUR_PURCHASE_KET__` text,
  `RETUR_PURCHASE_BUAT_OLEH__` varchar(255) NOT NULL,
  `RETUR_PURCHASE_TGL_BUAT__` date NOT NULL,
  `RETUR_PURCHASE_UPD_OLEH__` varchar(255) DEFAULT NULL,
  `RETUR_PURCHASE_TGL_UPD__` date DEFAULT NULL
) ENGINE=InnoDB  DEFAULT CHARSET=utf8 AUTO_INCREMENT=4 ;

--
-- Dumping data for table `t3_retur_purchase`
--

INSERT INTO `t3_retur_purchase` (`RETUR_PURCHASE_PK__`, `PU_ITM_PK__`, `RETUR_PURCHASE_JUMLAH__`, `RETUR_PURCHASE_KET__`, `RETUR_PURCHASE_BUAT_OLEH__`, `RETUR_PURCHASE_TGL_BUAT__`, `RETUR_PURCHASE_UPD_OLEH__`, `RETUR_PURCHASE_TGL_UPD__`) VALUES
(2, 1, 3, 'Kemasan rusak', 'admin', '2015-05-11', 'admin', '2015-05-11'),
(3, 1, 2, 'Kadaluarsa', 'admin', '2015-05-11', 'admin', '2015-05-11');

-- --------------------------------------------------------

--
-- Table structure for table `t3_stock_opname`
--

CREATE TABLE IF NOT EXISTS `t3_stock_opname` (
`SO_PK__` int(11) NOT NULL,
  `FLAG_PK__` int(11) NOT NULL,
  `SO_KODE__` varchar(255) NOT NULL,
  `SO_GRAND_TOTAL_SELISIH__` decimal(15,2) NOT NULL,
  `SO_KET__` text,
  `SO_BUAT_OLEH__` varchar(255) NOT NULL,
  `SO_TGL_BUAT__` date NOT NULL,
  `SO_UPD_OLEH__` varchar(255) DEFAULT NULL,
  `SO_TGL_UPD__` date DEFAULT NULL
) ENGINE=InnoDB  DEFAULT CHARSET=utf8 AUTO_INCREMENT=7 ;

--
-- Dumping data for table `t3_stock_opname`
--

INSERT INTO `t3_stock_opname` (`SO_PK__`, `FLAG_PK__`, `SO_KODE__`, `SO_GRAND_TOTAL_SELISIH__`, `SO_KET__`, `SO_BUAT_OLEH__`, `SO_TGL_BUAT__`, `SO_UPD_OLEH__`, `SO_TGL_UPD__`) VALUES
(2, 1, '15042015001', '100000.00', 'Second test.', 'admin', '2015-04-15', 'admin', '2015-05-02'),
(3, 1, '28042015001', '1265000.00', 'Try another test.', 'admin', '2015-04-28', 'admin', '2015-05-29'),
(6, 2, '02052015001', '2500000.00', 'Stock opname after flag addition test and commit.', 'admin', '2015-05-02', 'admin', '2015-05-05');

-- --------------------------------------------------------

--
-- Table structure for table `t3_stock_opname_item`
--

CREATE TABLE IF NOT EXISTS `t3_stock_opname_item` (
  `SO_PK__` int(11) NOT NULL,
  `BARANG_PK__` int(11) NOT NULL,
`SO_ITM_PK__` int(11) NOT NULL,
  `SO_ITM_JML_SISTEM__` int(11) DEFAULT NULL,
  `SO_ITM_HARGA__` decimal(15,2) DEFAULT NULL,
  `SO_ITM_TOTAL_SISTEM__` decimal(15,2) DEFAULT NULL,
  `SO_ITM_JML_FISIK__` int(11) NOT NULL,
  `SO_ITM_TOTAL_FISIK__` decimal(15,2) DEFAULT NULL,
  `SO_ITM_TOTAL_SELISIH__` decimal(15,2) DEFAULT NULL,
  `SO_ITM_BUAT_OLEH__` varchar(255) NOT NULL,
  `SO_ITM_TGL_BUAT__` date NOT NULL,
  `SO_ITM_UPD_OLEH__` varchar(255) DEFAULT NULL,
  `SO_ITM_TGL_UPD__` date DEFAULT NULL
) ENGINE=InnoDB  DEFAULT CHARSET=utf8 AUTO_INCREMENT=12 ;

--
-- Dumping data for table `t3_stock_opname_item`
--

INSERT INTO `t3_stock_opname_item` (`SO_PK__`, `BARANG_PK__`, `SO_ITM_PK__`, `SO_ITM_JML_SISTEM__`, `SO_ITM_HARGA__`, `SO_ITM_TOTAL_SISTEM__`, `SO_ITM_JML_FISIK__`, `SO_ITM_TOTAL_FISIK__`, `SO_ITM_TOTAL_SELISIH__`, `SO_ITM_BUAT_OLEH__`, `SO_ITM_TGL_BUAT__`, `SO_ITM_UPD_OLEH__`, `SO_ITM_TGL_UPD__`) VALUES
(2, 4, 2, 500, '125000.00', '62500000.00', 550, '68750000.00', '6250000.00', 'admin', '2015-04-15', NULL, NULL),
(3, 5, 3, 650, '12500.00', '8125000.00', 650, '8125000.00', '0.00', 'admin', '2015-04-28', 'admin', '2015-05-29'),
(6, 5, 7, 650, '12500.00', '8125000.00', 700, '8750000.00', '-625000.00', 'admin', '2015-05-02', 'admin', '2015-05-05'),
(6, 4, 8, 535, '125000.00', '66875000.00', 550, '68750000.00', '-1875000.00', 'admin', '2015-05-02', 'admin', '2015-05-05'),
(3, 4, 11, 555, '125000.00', '69375000.00', 550, '68750000.00', '625000.00', 'admin', '2015-05-29', NULL, NULL);

--
-- Indexes for dumped tables
--

--
-- Indexes for table `t1_flag`
--
ALTER TABLE `t1_flag`
 ADD PRIMARY KEY (`FLAG_PK__`), ADD UNIQUE KEY `FLAG_NAMA__` (`FLAG_NAMA__`);

--
-- Indexes for table `t1_kategori`
--
ALTER TABLE `t1_kategori`
 ADD PRIMARY KEY (`KATEGORI_PK__`);

--
-- Indexes for table `t1_penyesuaian_status`
--
ALTER TABLE `t1_penyesuaian_status`
 ADD PRIMARY KEY (`PENY_ST_PK__`);

--
-- Indexes for table `t1_role`
--
ALTER TABLE `t1_role`
 ADD PRIMARY KEY (`ROLE_PK__`);

--
-- Indexes for table `t1_satuan`
--
ALTER TABLE `t1_satuan`
 ADD PRIMARY KEY (`SATUAN_PK__`);

--
-- Indexes for table `t1_status`
--
ALTER TABLE `t1_status`
 ADD PRIMARY KEY (`STATUS_PK__`);

--
-- Indexes for table `t1_supplier`
--
ALTER TABLE `t1_supplier`
 ADD PRIMARY KEY (`SUPPLIER_PK__`);

--
-- Indexes for table `t2_barang`
--
ALTER TABLE `t2_barang`
 ADD PRIMARY KEY (`BARANG_PK__`), ADD UNIQUE KEY `BARANG_KODE__` (`BARANG_KODE__`), ADD KEY `KATEGORI_PK__` (`KATEGORI_PK__`), ADD KEY `SATUAN_PK__` (`SATUAN_PK__`), ADD KEY `STATUS_PK__` (`STATUS_PK__`);

--
-- Indexes for table `t2_costumer`
--
ALTER TABLE `t2_costumer`
 ADD PRIMARY KEY (`CST_PK__`);

--
-- Indexes for table `t2_karyawan`
--
ALTER TABLE `t2_karyawan`
 ADD PRIMARY KEY (`KARYAWAN_PK__`), ADD UNIQUE KEY `KARYAWAN_USERNAME__` (`KARYAWAN_USERNAME__`), ADD KEY `ROLE_PK__` (`ROLE_PK__`);

--
-- Indexes for table `t3_hutang`
--
ALTER TABLE `t3_hutang`
 ADD PRIMARY KEY (`HUTANG_PK__`), ADD KEY `FK_RELATIONSHIP_24` (`SUPPLIER_PK__`);

--
-- Indexes for table `t3_penjualan`
--
ALTER TABLE `t3_penjualan`
 ADD PRIMARY KEY (`PENJUALAN_PK__`), ADD UNIQUE KEY `PENJUALAN_NO_STRUK__` (`PENJUALAN_NO_STRUK__`), ADD KEY `FLAG_PK__` (`FLAG_PK__`);

--
-- Indexes for table `t3_penjualan_item`
--
ALTER TABLE `t3_penjualan_item`
 ADD PRIMARY KEY (`ITM_JUAL_PK`), ADD KEY `FK_RELATIONSHIP_7` (`BARANG_PK__`), ADD KEY `FK_RELATIONSHIP_8` (`PENJUALAN_PK__`);

--
-- Indexes for table `t3_penyesuaian_item`
--
ALTER TABLE `t3_penyesuaian_item`
 ADD PRIMARY KEY (`PENY_ITEM_PK__`), ADD KEY `PENY_ST_PK__` (`PENY_ST_PK__`), ADD KEY `BARANG_PK__` (`BARANG_PK__`);

--
-- Indexes for table `t3_piutang`
--
ALTER TABLE `t3_piutang`
 ADD PRIMARY KEY (`PIUTANG_PK__`), ADD KEY `FK_RELATIONSHIP_25` (`CST_PK__`);

--
-- Indexes for table `t3_purchase_order`
--
ALTER TABLE `t3_purchase_order`
 ADD PRIMARY KEY (`PO_PK__`), ADD UNIQUE KEY `PO_NOMOR__` (`PO_NOMOR__`), ADD KEY `FK_RELATIONSHIP_12` (`SUPPLIER_PK__`);

--
-- Indexes for table `t3_purchase_order_item`
--
ALTER TABLE `t3_purchase_order_item`
 ADD PRIMARY KEY (`PO_ITM_PK__`), ADD KEY `FK_RELATIONSHIP_13` (`BARANG_PK__`), ADD KEY `FK_RELATIONSHIP_14` (`PO_PK__`), ADD KEY `FK_RELATIONSHIP_15` (`SATUAN_PK__`);

--
-- Indexes for table `t3_purchase_units`
--
ALTER TABLE `t3_purchase_units`
 ADD PRIMARY KEY (`PU_PK__`), ADD KEY `FK_RELATIONSHIP_23` (`PO_PK__`);

--
-- Indexes for table `t3_purchase_units_item`
--
ALTER TABLE `t3_purchase_units_item`
 ADD PRIMARY KEY (`PU_ITM_PK__`), ADD KEY `FK_RELATIONSHIP_17` (`BARANG_PK__`), ADD KEY `FK_RELATIONSHIP_18` (`PU_PK__`), ADD KEY `FK_RELATIONSHIP_20` (`SATUAN_PK__`);

--
-- Indexes for table `t3_retur_penjualan`
--
ALTER TABLE `t3_retur_penjualan`
 ADD PRIMARY KEY (`RETUR_JUAL_PK__`), ADD KEY `ITM_JUAL_PK` (`ITM_JUAL_PK`);

--
-- Indexes for table `t3_retur_purchase`
--
ALTER TABLE `t3_retur_purchase`
 ADD PRIMARY KEY (`RETUR_PURCHASE_PK__`), ADD KEY `PU_ITM_PK__` (`PU_ITM_PK__`);

--
-- Indexes for table `t3_stock_opname`
--
ALTER TABLE `t3_stock_opname`
 ADD PRIMARY KEY (`SO_PK__`), ADD UNIQUE KEY `SO_KODE__` (`SO_KODE__`), ADD KEY `FLAG_PK__` (`FLAG_PK__`);

--
-- Indexes for table `t3_stock_opname_item`
--
ALTER TABLE `t3_stock_opname_item`
 ADD PRIMARY KEY (`SO_ITM_PK__`), ADD KEY `FK_RELATIONSHIP_10` (`BARANG_PK__`), ADD KEY `FK_RELATIONSHIP_11` (`SO_PK__`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `t1_flag`
--
ALTER TABLE `t1_flag`
MODIFY `FLAG_PK__` int(11) NOT NULL AUTO_INCREMENT,AUTO_INCREMENT=3;
--
-- AUTO_INCREMENT for table `t1_kategori`
--
ALTER TABLE `t1_kategori`
MODIFY `KATEGORI_PK__` int(11) NOT NULL AUTO_INCREMENT,AUTO_INCREMENT=9;
--
-- AUTO_INCREMENT for table `t1_penyesuaian_status`
--
ALTER TABLE `t1_penyesuaian_status`
MODIFY `PENY_ST_PK__` int(11) NOT NULL AUTO_INCREMENT,AUTO_INCREMENT=6;
--
-- AUTO_INCREMENT for table `t1_role`
--
ALTER TABLE `t1_role`
MODIFY `ROLE_PK__` int(11) NOT NULL AUTO_INCREMENT,AUTO_INCREMENT=2;
--
-- AUTO_INCREMENT for table `t1_satuan`
--
ALTER TABLE `t1_satuan`
MODIFY `SATUAN_PK__` int(11) NOT NULL AUTO_INCREMENT,AUTO_INCREMENT=5;
--
-- AUTO_INCREMENT for table `t1_status`
--
ALTER TABLE `t1_status`
MODIFY `STATUS_PK__` int(11) NOT NULL AUTO_INCREMENT,AUTO_INCREMENT=4;
--
-- AUTO_INCREMENT for table `t1_supplier`
--
ALTER TABLE `t1_supplier`
MODIFY `SUPPLIER_PK__` int(11) NOT NULL AUTO_INCREMENT,AUTO_INCREMENT=6;
--
-- AUTO_INCREMENT for table `t2_barang`
--
ALTER TABLE `t2_barang`
MODIFY `BARANG_PK__` int(11) NOT NULL AUTO_INCREMENT,AUTO_INCREMENT=9;
--
-- AUTO_INCREMENT for table `t2_costumer`
--
ALTER TABLE `t2_costumer`
MODIFY `CST_PK__` int(11) NOT NULL AUTO_INCREMENT,AUTO_INCREMENT=3;
--
-- AUTO_INCREMENT for table `t2_karyawan`
--
ALTER TABLE `t2_karyawan`
MODIFY `KARYAWAN_PK__` int(11) NOT NULL AUTO_INCREMENT,AUTO_INCREMENT=3;
--
-- AUTO_INCREMENT for table `t3_hutang`
--
ALTER TABLE `t3_hutang`
MODIFY `HUTANG_PK__` int(11) NOT NULL AUTO_INCREMENT,AUTO_INCREMENT=3;
--
-- AUTO_INCREMENT for table `t3_penjualan`
--
ALTER TABLE `t3_penjualan`
MODIFY `PENJUALAN_PK__` int(11) NOT NULL AUTO_INCREMENT,AUTO_INCREMENT=12;
--
-- AUTO_INCREMENT for table `t3_penjualan_item`
--
ALTER TABLE `t3_penjualan_item`
MODIFY `ITM_JUAL_PK` int(11) NOT NULL AUTO_INCREMENT,AUTO_INCREMENT=33;
--
-- AUTO_INCREMENT for table `t3_penyesuaian_item`
--
ALTER TABLE `t3_penyesuaian_item`
MODIFY `PENY_ITEM_PK__` int(11) NOT NULL AUTO_INCREMENT,AUTO_INCREMENT=20;
--
-- AUTO_INCREMENT for table `t3_piutang`
--
ALTER TABLE `t3_piutang`
MODIFY `PIUTANG_PK__` int(11) NOT NULL AUTO_INCREMENT,AUTO_INCREMENT=3;
--
-- AUTO_INCREMENT for table `t3_purchase_order`
--
ALTER TABLE `t3_purchase_order`
MODIFY `PO_PK__` int(11) NOT NULL AUTO_INCREMENT,AUTO_INCREMENT=8;
--
-- AUTO_INCREMENT for table `t3_purchase_order_item`
--
ALTER TABLE `t3_purchase_order_item`
MODIFY `PO_ITM_PK__` int(11) NOT NULL AUTO_INCREMENT,AUTO_INCREMENT=17;
--
-- AUTO_INCREMENT for table `t3_purchase_units`
--
ALTER TABLE `t3_purchase_units`
MODIFY `PU_PK__` int(11) NOT NULL AUTO_INCREMENT,AUTO_INCREMENT=4;
--
-- AUTO_INCREMENT for table `t3_purchase_units_item`
--
ALTER TABLE `t3_purchase_units_item`
MODIFY `PU_ITM_PK__` int(11) NOT NULL AUTO_INCREMENT,AUTO_INCREMENT=3;
--
-- AUTO_INCREMENT for table `t3_retur_penjualan`
--
ALTER TABLE `t3_retur_penjualan`
MODIFY `RETUR_JUAL_PK__` int(11) NOT NULL AUTO_INCREMENT,AUTO_INCREMENT=8;
--
-- AUTO_INCREMENT for table `t3_retur_purchase`
--
ALTER TABLE `t3_retur_purchase`
MODIFY `RETUR_PURCHASE_PK__` int(11) NOT NULL AUTO_INCREMENT,AUTO_INCREMENT=4;
--
-- AUTO_INCREMENT for table `t3_stock_opname`
--
ALTER TABLE `t3_stock_opname`
MODIFY `SO_PK__` int(11) NOT NULL AUTO_INCREMENT,AUTO_INCREMENT=7;
--
-- AUTO_INCREMENT for table `t3_stock_opname_item`
--
ALTER TABLE `t3_stock_opname_item`
MODIFY `SO_ITM_PK__` int(11) NOT NULL AUTO_INCREMENT,AUTO_INCREMENT=12;
--
-- Constraints for dumped tables
--

--
-- Constraints for table `t2_barang`
--
ALTER TABLE `t2_barang`
ADD CONSTRAINT `t2_barang_ibfk_10` FOREIGN KEY (`STATUS_PK__`) REFERENCES `t1_status` (`STATUS_PK__`),
ADD CONSTRAINT `t2_barang_ibfk_11` FOREIGN KEY (`KATEGORI_PK__`) REFERENCES `t1_kategori` (`KATEGORI_PK__`),
ADD CONSTRAINT `t2_barang_ibfk_9` FOREIGN KEY (`SATUAN_PK__`) REFERENCES `t1_satuan` (`SATUAN_PK__`);

--
-- Constraints for table `t2_karyawan`
--
ALTER TABLE `t2_karyawan`
ADD CONSTRAINT `t2_karyawan_ibfk_1` FOREIGN KEY (`ROLE_PK__`) REFERENCES `t1_role` (`ROLE_PK__`);

--
-- Constraints for table `t3_hutang`
--
ALTER TABLE `t3_hutang`
ADD CONSTRAINT `FK_RELATIONSHIP_24` FOREIGN KEY (`SUPPLIER_PK__`) REFERENCES `t1_supplier` (`SUPPLIER_PK__`);

--
-- Constraints for table `t3_penjualan`
--
ALTER TABLE `t3_penjualan`
ADD CONSTRAINT `t3_penjualan_ibfk_1` FOREIGN KEY (`FLAG_PK__`) REFERENCES `t1_flag` (`FLAG_PK__`);

--
-- Constraints for table `t3_penjualan_item`
--
ALTER TABLE `t3_penjualan_item`
ADD CONSTRAINT `FK_RELATIONSHIP_7` FOREIGN KEY (`BARANG_PK__`) REFERENCES `t2_barang` (`BARANG_PK__`),
ADD CONSTRAINT `FK_RELATIONSHIP_8` FOREIGN KEY (`PENJUALAN_PK__`) REFERENCES `t3_penjualan` (`PENJUALAN_PK__`);

--
-- Constraints for table `t3_penyesuaian_item`
--
ALTER TABLE `t3_penyesuaian_item`
ADD CONSTRAINT `t3_penyesuaian_item_ibfk_1` FOREIGN KEY (`BARANG_PK__`) REFERENCES `t2_barang` (`BARANG_PK__`),
ADD CONSTRAINT `t3_penyesuaian_item_ibfk_2` FOREIGN KEY (`PENY_ST_PK__`) REFERENCES `t1_penyesuaian_status` (`PENY_ST_PK__`);

--
-- Constraints for table `t3_piutang`
--
ALTER TABLE `t3_piutang`
ADD CONSTRAINT `FK_RELATIONSHIP_25` FOREIGN KEY (`CST_PK__`) REFERENCES `t2_costumer` (`CST_PK__`);

--
-- Constraints for table `t3_purchase_order`
--
ALTER TABLE `t3_purchase_order`
ADD CONSTRAINT `t3_purchase_order_ibfk_1` FOREIGN KEY (`SUPPLIER_PK__`) REFERENCES `t1_supplier` (`SUPPLIER_PK__`);

--
-- Constraints for table `t3_purchase_order_item`
--
ALTER TABLE `t3_purchase_order_item`
ADD CONSTRAINT `FK_RELATIONSHIP_13` FOREIGN KEY (`BARANG_PK__`) REFERENCES `t2_barang` (`BARANG_PK__`),
ADD CONSTRAINT `FK_RELATIONSHIP_14` FOREIGN KEY (`PO_PK__`) REFERENCES `t3_purchase_order` (`PO_PK__`),
ADD CONSTRAINT `FK_RELATIONSHIP_15` FOREIGN KEY (`SATUAN_PK__`) REFERENCES `t1_satuan` (`SATUAN_PK__`);

--
-- Constraints for table `t3_purchase_units`
--
ALTER TABLE `t3_purchase_units`
ADD CONSTRAINT `t3_purchase_units_ibfk_1` FOREIGN KEY (`PO_PK__`) REFERENCES `t3_purchase_order` (`PO_PK__`);

--
-- Constraints for table `t3_purchase_units_item`
--
ALTER TABLE `t3_purchase_units_item`
ADD CONSTRAINT `FK_RELATIONSHIP_17` FOREIGN KEY (`BARANG_PK__`) REFERENCES `t2_barang` (`BARANG_PK__`),
ADD CONSTRAINT `FK_RELATIONSHIP_18` FOREIGN KEY (`PU_PK__`) REFERENCES `t3_purchase_units` (`PU_PK__`),
ADD CONSTRAINT `FK_RELATIONSHIP_20` FOREIGN KEY (`SATUAN_PK__`) REFERENCES `t1_satuan` (`SATUAN_PK__`);

--
-- Constraints for table `t3_retur_penjualan`
--
ALTER TABLE `t3_retur_penjualan`
ADD CONSTRAINT `t3_retur_penjualan_ibfk_1` FOREIGN KEY (`ITM_JUAL_PK`) REFERENCES `t3_penjualan_item` (`ITM_JUAL_PK`);

--
-- Constraints for table `t3_retur_purchase`
--
ALTER TABLE `t3_retur_purchase`
ADD CONSTRAINT `t3_retur_purchase_ibfk_1` FOREIGN KEY (`PU_ITM_PK__`) REFERENCES `t3_purchase_units_item` (`PU_ITM_PK__`);

--
-- Constraints for table `t3_stock_opname`
--
ALTER TABLE `t3_stock_opname`
ADD CONSTRAINT `t3_stock_opname_ibfk_1` FOREIGN KEY (`FLAG_PK__`) REFERENCES `t1_flag` (`FLAG_PK__`);

--
-- Constraints for table `t3_stock_opname_item`
--
ALTER TABLE `t3_stock_opname_item`
ADD CONSTRAINT `FK_RELATIONSHIP_10` FOREIGN KEY (`BARANG_PK__`) REFERENCES `t2_barang` (`BARANG_PK__`),
ADD CONSTRAINT `FK_RELATIONSHIP_11` FOREIGN KEY (`SO_PK__`) REFERENCES `t3_stock_opname` (`SO_PK__`);

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
